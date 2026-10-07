const crypto = require("crypto");
const Session = require("../models/Session");
const User = require("../models/User");

const ACTIVE_WINDOW = 45 * 1000;

const hashIp = (ip) => {
  if (!ip) return null;

  return crypto
    .createHash("sha256")
    .update(`${ip}:${process.env.SESSION_IP_SALT || "menupio"}`)
    .digest("hex");
};

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.headers["x-real-ip"] || req.socket?.remoteAddress || null;
};

exports.heartbeat = async (req, res) => {
  try {
    const {
      sessionId,
      visitorId,
      currentPage,
      currentPath,

      device,
      browser,
      browserVersion,
      os,
      osVersion,

      screen,
      viewport,

      language,
      languages,
      timezone,

      referrer,
      landingPage,

      utm,
    } = req.body;

    if (!sessionId || !visitorId) {
      return res.status(400).json({
        message: "sessionId and visitorId are required.",
      });
    }

    const now = new Date();

    const userId = req.user?._id || null;

    const ip = getClientIp(req);

    const session = await Session.findOneAndUpdate(
      {
        sessionId,
      },
      {
        $set: {
          lastSeen: now,

          isActive: true,

          currentPage: currentPage || null,
          currentPath: currentPath || null,

          device: device || null,
          browser: browser || null,
          browserVersion: browserVersion || null,
          os: os || null,
          osVersion: osVersion || null,

          screen: screen || {},
          viewport: viewport || {},

          language: language || null,
          languages: Array.isArray(languages) ? languages : [],

          timezone: timezone || null,

          referrer: referrer || null,
          landingPage: landingPage || null,

          utm: utm || {},

          ipHash: hashIp(ip),

          ...(userId
            ? {
                user: userId,
              }
            : {}),
        },

        $setOnInsert: {
          sessionId,
          visitorId,
          startedAt: now,
          expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30),
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    // Calculate current session duration.
    session.sessionTime = Math.floor(
      (now.getTime() - session.startedAt.getTime()) / 1000,
    );

    await session.save();

    return res.status(200).json({
      success: true,

      sessionId: session.sessionId,

      isActive: true,

      lastSeen: session.lastSeen,

      sessionTime: session.sessionTime,
    });
  } catch (error) {
    console.error("SESSION HEARTBEAT ERROR:", error);

    return res.status(500).json({
      message: "Unable to update session.",
    });
  }
};

exports.getActiveSessions = async (req, res) => {
  try {
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW);

    // Mark sessions that haven't checked in recently as inactive.
    await Session.updateMany(
      {
        isActive: true,
        lastSeen: {
          $lt: activeSince,
        },
      },
      {
        $set: {
          isActive: false,
        },
      },
    );

    const activeSessions = await Session.find({
      isActive: true,
      lastSeen: {
        $gte: activeSince,
      },
      isBot: false,
    })
      .populate("user", "name email role")
      .sort({
        lastSeen: -1,
      })
      .lean();

    // A person may have multiple tabs.
    // visitorId allows us to approximate unique visitors.
    const uniqueVisitors = new Set(
      activeSessions.map((session) => session.visitorId),
    );

    const loggedIn = activeSessions.filter((session) => session.user).length;

    const anonymous = activeSessions.filter((session) => !session.user).length;

    return res.status(200).json({
      success: true,

      online: uniqueVisitors.size,

      sessions: activeSessions.length,

      loggedIn,

      anonymous,

      activeSince,

      visitors: activeSessions,
    });
  } catch (error) {
    console.error("GET ACTIVE SESSIONS ERROR:", error);

    return res.status(500).json({
      message: "Unable to retrieve active sessions.",
    });
  }
};

exports.endSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "sessionId is required.",
      });
    }

    const session = await Session.findOneAndUpdate(
      {
        sessionId,
      },
      {
        $set: {
          isActive: false,
          endedAt: new Date(),
        },
      },
      {
        new: true,
      },
    );

    if (!session) {
      return res.status(404).json({
        message: "Session not found.",
      });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("END SESSION ERROR:", error);

    return res.status(500).json({
      message: "Unable to end session.",
    });
  }
};
exports.identifySession = async (req, res) => {
  try {
    const { sessionId, visitorId, userId } = req.body;

    if (!sessionId || !visitorId || !userId) {
      return res.status(400).json({
        message: "sessionId, visitorId and userId are required.",
      });
    }

    const session = await Session.findOneAndUpdate(
      {
        sessionId,
        visitorId,
      },
      {
        $set: {
          user: userId,
          lastSeen: new Date(),
          isActive: true,
        },
      },
      {
        new: true,
      },
    );

    if (!session) {
      return res.status(404).json({
        message: "Session not found.",
      });
    }

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("IDENTIFY SESSION ERROR:", error);

    return res.status(500).json({
      message: "Unable to identify session.",
    });
  }
};
exports.trackProductClick = async (req, res) => {
  try {
    const {
      sessionId,
      visitorId,
      menuItem,
      siteItem,
      screen,
      category,
      categoryName,
      path,
      position,
    } = req.body;

    if (!sessionId || !visitorId) {
      return res.status(400).json({
        message: "sessionId and visitorId are required.",
      });
    }

    if (!menuItem && !siteItem) {
      return res.status(400).json({
        message: "menuItem or siteItem is required.",
      });
    }

    const session = await Session.findOne({
      sessionId,
      visitorId,
    });

    if (!session) {
      return res.status(404).json({
        message: "Session not found.",
      });
    }

    session.productClicks.push({
      menuItem: menuItem || null,

      siteItem: siteItem || null,

      screen: screen || null,

      category: category || null,

      categoryName: categoryName || null,

      path: path || null,

      position: Number.isFinite(Number(position)) ? Number(position) : null,

      clickedAt: new Date(),
    });

    session.lastSeen = new Date();

    session.isActive = true;
    await session.save();

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error("TRACK PRODUCT CLICK ERROR:", error);

    return res.status(500).json({
      message: "Unable to track product click.",
    });
  }
};
exports.getSessionsByScreen = async (req, res) => {
  try {
    const { screenId } = req.params;

    if (!screenId) {
      return res.status(400).json({
        message: "screenId is required.",
      });
    }

    const sessions = await Session.find({
      "productClicks.screen": screenId,
    })
      .sort({ lastSeen: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      screenId,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    console.error("GET SESSIONS BY SCREEN ERROR:", error);

    return res.status(500).json({
      message: "Unable to load sessions for this screen.",
    });
  }
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.getSessionHistory = async (req, res) => {
  try {
    const q = req.query;
    const page = Math.max(parseInt(q.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100);
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW);

    const filter = { isBot: false };
    const and = [];

    if (q.from || q.to) {
      filter.startedAt = {};
      if (q.from) {
        const from = new Date(q.from);
        if (!Number.isNaN(from.getTime())) filter.startedAt.$gte = from;
      }
      if (q.to) {
        const to = new Date(q.to);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          filter.startedAt.$lte = to;
        }
      }
      if (!Object.keys(filter.startedAt).length) delete filter.startedAt;
    }

    if (["desktop", "mobile", "tablet"].includes(q.device)) {
      filter.device = q.device;
    }
    if (q.visitor === "logged") filter.user = { $ne: null };
    if (q.visitor === "anonymous") filter.user = null;
    if (q.status === "active") {
      filter.isActive = true;
      filter.lastSeen = { $gte: activeSince };
    } else if (q.status === "ended") {
      and.push({
        $or: [{ isActive: false }, { lastSeen: { $lt: activeSince } }],
      });
    }
    if (q.clicks === "with") filter["productClicks.0"] = { $exists: true };
    if (q.clicks === "without") filter["productClicks.0"] = { $exists: false };
    if (q.country) filter.country = String(q.country);

    const search = String(q.search || "").trim().slice(0, 100);
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      const users = await User.find({ $or: [{ name: rx }, { email: rx }] })
        .select("_id")
        .limit(200)
        .lean();
      and.push({
        $or: [
          { visitorId: rx },
          { city: rx },
          { country: rx },
          { browser: rx },
          { os: rx },
          { currentPath: rx },
          { landingPage: rx },
          { referrer: rx },
          { user: { $in: users.map((u) => u._id) } },
        ],
      });
    }
    if (and.length) filter.$and = and;

    const sortMap = {
      newest: { startedAt: -1 },
      oldest: { startedAt: 1 },
      longest: { sessionTime: -1 },
      lastSeen: { lastSeen: -1 },
    };
    const sort = sortMap[q.sort] || sortMap.newest;

    const [total, sessions, countries] = await Promise.all([
      Session.countDocuments(filter),
      Session.find(filter)
        .select("-userAgent -ipHash")
        .populate("user", "name email role")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Session.distinct("country", { isBot: false, country: { $ne: null } }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      countries: countries.filter(Boolean).sort(),
      sessions: sessions.map((s) => ({
        ...s,
        isLive: Boolean(s.isActive && s.lastSeen >= activeSince),
        productClicks: s.productClicks || [],
      })),
    });
  } catch (error) {
    console.error("GET SESSION HISTORY ERROR:", error);
    return res.status(500).json({ message: "Unable to retrieve session history." });
  }
};

