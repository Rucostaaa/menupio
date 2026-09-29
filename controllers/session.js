const crypto = require("crypto");
const Session = require("../models/Session");

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
