const mongoose = require("mongoose");
const User = require("../models/User");
const SalesLead = require("../models/SalesLead");
const SalesActivity = require("../models/SalesActivity");
const { sendEmail } = require("../utils/sendEmail");

const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "DEMO",
  "PROPOSAL",
  "CUSTOMER",
  "LOST",
  "NO_RESPONSE",
];
const ACTIVITY_TYPES = ["NOTE", "EMAIL", "PHONE", "WHATSAPP", "DEMO", "PROPOSAL"];
const LEAD_FIELDS = [
  "restaurantName",
  "businessType",
  "address",
  "city",
  "country",
  "website",
  "instagram",
  "facebook",
  "phone",
  "email",
  "contactName",
  "notes",
  "source",
  "assignedTo",
];
const FINAL_STATUSES = ["CUSTOMER", "LOST"];
const advertiserInquiryAttempts = new Map();

const sendValidationError = (res, message) =>
  res.status(400).json({ success: false, message });

const sendPersistenceValidationError = (res, error) => {
  if (error?.name !== "ValidationError" && error?.name !== "CastError") {
    return false;
  }
  sendValidationError(res, error.message);
  return true;
};

const normalizeLeadFields = (body, { creating = false, defaultAssignee } = {}) => {
  const data = {};

  for (const field of LEAD_FIELDS) {
    if (body[field] !== undefined) {
      data[field] =
        typeof body[field] === "string" ? body[field].trim() : body[field];
    }
  }

  if (creating) {
    data.status = "NEW";
    data.assignedTo = data.assignedTo || defaultAssignee;
    data.source = data.source || "manual";
  }

  if (data.email) data.email = data.email.toLowerCase();
  return data;
};

const validateLeadFields = async (data, res, { creating = false } = {}) => {
  if (creating && !data.restaurantName) {
    sendValidationError(res, "Restaurant name is required.");
    return false;
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    sendValidationError(res, "Provide a valid email address.");
    return false;
  }
  if (data.assignedTo) {
    if (!mongoose.isValidObjectId(data.assignedTo)) {
      sendValidationError(res, "Assigned user ID is invalid.");
      return false;
    }
    const assigneeExists = await User.exists({ _id: data.assignedTo });
    if (!assigneeExists) {
      sendValidationError(res, "Assigned user was not found.");
      return false;
    }
  }
  return true;
};

const validateLeadId = (id, res) => {
  if (!mongoose.isValidObjectId(id)) {
    sendValidationError(res, "Lead ID is invalid.");
    return false;
  }
  return true;
};

const getDayBounds = (query) => {
  const start = new Date(query.dayStart);
  const end = new Date(query.dayEnd);
  if (
    !query.dayStart ||
    !query.dayEnd ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start >= end
  ) {
    return null;
  }
  return { start, end };
};

const serializeLead = (lead) => (lead?.toObject ? lead.toObject() : lead);

exports.getDashboard = async (req, res) => {
  try {
    const bounds = getDayBounds(req.query);
    if (!bounds) {
      return sendValidationError(
        res,
        "Valid dayStart and dayEnd ISO dates are required.",
      );
    }
    const { start, end } = bounds;
    const [statusCounts, totalLeads, dueToday, overdue, upcoming] =
      await Promise.all([
        SalesLead.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        SalesLead.countDocuments(),
        SalesLead.countDocuments({
          nextFollowUpAt: { $gte: start, $lt: end },
          status: { $nin: FINAL_STATUSES },
        }),
        SalesLead.countDocuments({
          nextFollowUpAt: { $lt: start },
          status: { $nin: FINAL_STATUSES },
        }),
        SalesLead.find({
          nextFollowUpAt: { $gte: end },
          status: { $nin: FINAL_STATUSES },
        })
          .sort({ nextFollowUpAt: 1 })
          .limit(8)
          .select("restaurantName city contactName status nextAction nextFollowUpAt")
          .lean(),
      ]);
    const byStatus = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0]));
    for (const item of statusCounts) byStatus[item._id] = item.count;

    return res.json({
      success: true,
      dashboard: {
        totalLeads,
        byStatus,
        followUpsToday: dueToday,
        overdueFollowUps: overdue,
        upcomingFollowUps: upcoming,
      },
    });
  } catch (error) {
    console.error("GET SALES DASHBOARD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load the Sales dashboard.",
    });
  }
};

exports.getLeads = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = {};
    const { status, search, followUp } = req.query;
    const bounds = getDayBounds(req.query);

    if (status && status !== "ALL") {
      if (!LEAD_STATUSES.includes(status)) {
        return sendValidationError(res, "Unknown lead status.");
      }
      filter.status = status;
    }
    if (search?.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { restaurantName: { $regex: escaped, $options: "i" } },
        { city: { $regex: escaped, $options: "i" } },
        { contactName: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }
    if (followUp) {
      if (!bounds) {
        return sendValidationError(
          res,
          "Valid dayStart and dayEnd ISO dates are required for follow-up filters.",
        );
      }
      const selectedStatus = filter.status;
      filter.status = {
        $nin: FINAL_STATUSES,
        ...(selectedStatus ? { $in: [selectedStatus] } : {}),
      };
      if (followUp === "today") {
        filter.nextFollowUpAt = { $gte: bounds.start, $lt: bounds.end };
      } else if (followUp === "overdue") {
        filter.nextFollowUpAt = { $lt: bounds.start };
      } else if (followUp === "upcoming") {
        filter.nextFollowUpAt = { $gte: bounds.end };
      } else {
        return sendValidationError(res, "Unknown follow-up filter.");
      }
    }

    const [leads, total] = await Promise.all([
      SalesLead.find(filter)
        .populate("assignedTo", "_id name email")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SalesLead.countDocuments(filter),
    ]);
    return res.json({
      success: true,
      leads,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET SALES LEADS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load Sales leads.",
    });
  }
};

exports.getUnreadLeadCount = async (req, res) => {
  try {
    const count = await SalesLead.countDocuments({ readAt: null });
    return res.json({ success: true, count });
  } catch (error) {
    console.error("GET UNREAD SALES LEAD COUNT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load unread Sales lead count.",
    });
  }
};

exports.createLead = async (req, res) => {
  try {
    const leadData = normalizeLeadFields(req.body || {}, {
      creating: true,
      defaultAssignee: req.user._id,
    });
    if (!(await validateLeadFields(leadData, res, { creating: true }))) return;

    const lead = await SalesLead.create(leadData);
    return res.status(201).json({
      success: true,
      lead: await SalesLead.findById(lead._id)
        .populate("assignedTo", "_id name email")
        .lean(),
    });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    console.error("CREATE SALES LEAD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not create the lead.",
    });
  }
};

exports.bulkCreateLeads = async (req, res) => {
  try {
    const input = Array.isArray(req.body) ? req.body : req.body?.leads;
    if (!Array.isArray(input) || input.length === 0) {
      return sendValidationError(res, "Send a non-empty JSON array of leads.");
    }
    if (input.length > 500) {
      return sendValidationError(res, "A maximum of 500 leads per import is allowed.");
    }

    const text = (value, max) =>
      typeof value === "string" || typeof value === "number"
        ? String(value).trim().slice(0, max)
        : "";
    const keyOf = (name, city) =>
      `${name.toLowerCase()}|${(city || "").toLowerCase()}`;

    const docs = [];
    const invalid = [];
    const seen = new Set();
    input.forEach((row, index) => {
      const name = text(row?.name ?? row?.restaurantName, 160);
      if (!name) {
        invalid.push({ index, reason: "Missing name" });
        return;
      }
      const city = text(row.city, 100);
      const key = keyOf(name, city);
      if (seen.has(key)) {
        invalid.push({ index, name, reason: "Duplicate in file" });
        return;
      }
      seen.add(key);
      const email = text(row.email, 254).toLowerCase();
      docs.push({
        restaurantName: name,
        city,
        phone: text(row.phone, 50),
        notes: text(row.notes, 10000),
        ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
        status: "NEW",
        source: "import",
        assignedTo: req.user._id,
      });
    });

    const existing = await SalesLead.find({
      restaurantName: { $in: docs.map((doc) => doc.restaurantName) },
    })
      .select("restaurantName city")
      .lean();
    const existingKeys = new Set(
      existing.map((lead) => keyOf(lead.restaurantName, lead.city)),
    );
    const toInsert = docs.filter((doc) => {
      if (existingKeys.has(keyOf(doc.restaurantName, doc.city))) {
        invalid.push({ name: doc.restaurantName, reason: "Already exists" });
        return false;
      }
      return true;
    });

    const created = toInsert.length
      ? await SalesLead.insertMany(toInsert, { ordered: false })
      : [];

    return res.status(201).json({
      success: true,
      created: created.length,
      skipped: invalid.length,
      skippedDetails: invalid,
    });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    console.error("BULK CREATE SALES LEADS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not import the leads.",
    });
  }
};

exports.markLeadRead = async (req, res) => {
  try {
    if (!validateLeadId(req.params.id, res)) return;
    const existingLead = await SalesLead.findById(req.params.id).select("readAt");
    if (!existingLead) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }
    const wasUnread = !existingLead.readAt;
    const lead = await SalesLead.findByIdAndUpdate(
      req.params.id,
      { $set: { readAt: new Date() } },
      { returnDocument: "after", runValidators: true },
    )
      .populate("assignedTo", "_id name email")
      .lean();

    return res.json({ success: true, lead, wasUnread });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    console.error("MARK SALES LEAD READ ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not mark the lead as read.",
    });
  }
};

exports.deleteLead = async (req, res) => {
  let session;
  try {
    if (!validateLeadId(req.params.id, res)) return;
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const lead = await SalesLead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error("Lead not found.");
        error.statusCode = 404;
        throw error;
      }
      await SalesActivity.deleteMany({ lead: lead._id }, { session });
      await lead.deleteOne({ session });
    });
    return res.json({ success: true, id: req.params.id });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("DELETE SALES LEAD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not delete the lead.",
    });
  } finally {
    if (session) await session.endSession();
  }
};

exports.createAdvertiserInquiry = async (req, res) => {
  const now = Date.now();
  const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
  if (advertiserInquiryAttempts.size > 1000) {
    for (const [ip, attempt] of advertiserInquiryAttempts) {
      if (now - attempt.startedAt >= 60 * 60 * 1000) {
        advertiserInquiryAttempts.delete(ip);
      }
    }
  }
  const previousAttempt = advertiserInquiryAttempts.get(clientIp);
  if (!previousAttempt && advertiserInquiryAttempts.size >= 1000) {
    return res.status(429).json({
      success: false,
      message: "Too many enquiries. Please try again later.",
    });
  }
  if (previousAttempt && now - previousAttempt.startedAt < 60 * 60 * 1000) {
    if (previousAttempt.count >= 4) {
      return res.status(429).json({
        success: false,
        message: "Too many enquiries. Please try again later.",
      });
    }
    previousAttempt.count += 1;
  } else {
    advertiserInquiryAttempts.set(clientIp, { startedAt: now, count: 1 });
  }

  const { fax, consent, ...body } = req.body || {};
  if (fax) {
    return res.status(201).json({ success: true });
  }
  if (consent !== true) {
    return sendValidationError(
      res,
      "Consent is required to process this enquiry.",
    );
  }

  try {
    const restaurantName = String(body.restaurantName || "").trim();
    const contactName = String(body.contactName || "").trim();
    const businessType = String(body.businessType || "").trim();
    const address = String(body.address || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    if (
      !restaurantName ||
      !contactName ||
      !businessType ||
      !email ||
      !phone ||
      !address
    ) {
      return sendValidationError(
        res,
        "Business name, owner name, service, email, phone and address are required.",
      );
    }
    if (
      restaurantName.length > 160 ||
      contactName.length > 160 ||
      businessType.length > 100 ||
      email.length > 254 ||
      phone.length > 50 ||
      address.length > 500
    ) {
      return sendValidationError(res, "One or more fields are too long.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendValidationError(res, "Provide a valid email address.");
    }

    const admin = await User.findOne({ role: "Admin" }).select("_id email");
    if (!admin?.email) {
      return res.status(503).json({
        success: false,
        message: "No Admin email is configured to receive enquiries.",
      });
    }

    const escapeHtml = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const details = {
      "Business name": restaurantName,
      "Owner name": contactName,
      Service: businessType,
      Email: email,
      Phone: phone,
      Address: address,
      City: String(body.city || "").trim(),
      Website: String(body.website || "").trim(),
      Details: String(body.notes || "").trim(),
    };
    const text = [
      "New advertising enquiry",
      ...Object.entries(details).map(([label, value]) =>
        value ? `${label}: ${value}` : null,
      ).filter(Boolean),
    ].join("\n");
    const html = `
      <h2>New advertising enquiry</h2>
      <dl>${Object.entries(details)
        .filter(([, value]) => value)
        .map(
          ([label, value]) =>
            `<dt><strong>${escapeHtml(label)}</strong></dt><dd>${escapeHtml(value)}</dd>`,
        )
        .join("")}</dl>`;

    const lead = await SalesLead.create({
      restaurantName,
      contactName,
      businessType,
      address,
      email,
      phone,
      city: String(body.city || "").trim().slice(0, 100),
      website: String(body.website || "").trim().slice(0, 2048),
      notes: String(body.notes || "").trim().slice(0, 4000),
      source: "public-menu-advertiser",
      assignedTo: admin._id,
      status: "NEW",
    });

    let notificationSent = false;
    try {
      await sendEmail({
        to: admin.email,
        subject: `Advertising enquiry: ${restaurantName}`,
        text,
        html,
      });
      notificationSent = true;
    } catch (emailError) {
      console.error("ADVERTISER INQUIRY EMAIL ERROR:", emailError);
    }

    return res.status(201).json({
      success: true,
      message: notificationSent
        ? "Advertising enquiry received."
        : "Enquiry saved, but the Admin email notification could not be sent.",
      notificationSent,
      id: lead._id,
    });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    console.error("CREATE ADVERTISER INQUIRY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not send the advertising enquiry.",
    });
  }
};

exports.getLead = async (req, res) => {
  try {
    if (!validateLeadId(req.params.id, res)) return;
    const [lead, activities] = await Promise.all([
      SalesLead.findById(req.params.id)
        .populate("assignedTo", "_id name email")
        .lean(),
      SalesActivity.find({ lead: req.params.id }).sort({ createdAt: 1 }).lean(),
    ]);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }
    return res.json({ success: true, lead, activities });
  } catch (error) {
    console.error("GET SALES LEAD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load the lead.",
    });
  }
};

exports.updateLead = async (req, res) => {
  try {
    if (!validateLeadId(req.params.id, res)) return;
    const leadData = normalizeLeadFields(req.body || {});
    if (!(await validateLeadFields(leadData, res))) return;

    const lead = await SalesLead.findByIdAndUpdate(req.params.id, leadData, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "_id name email")
      .lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }
    return res.json({ success: true, lead });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    console.error("UPDATE SALES LEAD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the lead.",
    });
  }
};

exports.updateLeadStatus = async (req, res) => {
  const { status } = req.body || {};
  if (!validateLeadId(req.params.id, res)) return;
  if (!LEAD_STATUSES.includes(status)) {
    return sendValidationError(res, "Unknown lead status.");
  }

  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const lead = await SalesLead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error("Lead not found.");
        error.statusCode = 404;
        throw error;
      }
      const previousStatus = lead.status;
      if (previousStatus !== status) {
        lead.status = status;
        if (FINAL_STATUSES.includes(status)) {
          lead.nextAction = "";
          lead.nextFollowUpAt = null;
          lead.followUpNote = "";
        }
        await lead.save({ session });
        await SalesActivity.create(
          [
            {
              lead: lead._id,
              type: "STATUS_CHANGE",
              content: `Status changed from ${previousStatus} to ${status}.`,
            },
          ],
          { session },
        );
      }
      result = await SalesLead.findById(req.params.id)
        .populate("assignedTo", "_id name email")
        .session(session)
        .lean();
    });
    return res.json({ success: true, lead: result });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("UPDATE SALES LEAD STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the lead status and its activity.",
    });
  } finally {
    if (session) await session.endSession();
  }
};

exports.addLeadActivity = async (req, res) => {
  let session;
  try {
    if (!validateLeadId(req.params.id, res)) return;
    const { type, content } = req.body || {};
    const normalizedContent = String(content || "").trim();
    if (!ACTIVITY_TYPES.includes(type)) {
      return sendValidationError(res, "Unknown activity type.");
    }
    if (!normalizedContent || normalizedContent.length > 5000) {
      return sendValidationError(res, "Activity content is required (maximum 5000 characters).");
    }

    session = await mongoose.startSession();
    let leadId;
    let activity;
    await session.withTransaction(async () => {
      const lead = await SalesLead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error("Lead not found.");
        error.statusCode = 404;
        throw error;
      }
      leadId = lead._id;
      [activity] = await SalesActivity.create(
        [
          {
            lead: lead._id,
            type,
            content: normalizedContent,
          },
        ],
        { session },
      );
      if (["EMAIL", "PHONE", "WHATSAPP", "DEMO", "PROPOSAL"].includes(type)) {
        lead.lastContactAt = activity.createdAt;
        await lead.save({ session });
      }
    });
    const lead = await SalesLead.findById(leadId)
      .populate("assignedTo", "_id name email")
      .lean();
    return res.status(201).json({
      success: true,
      activity,
      lead: serializeLead(lead),
    });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("ADD SALES LEAD ACTIVITY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not add the lead activity.",
    });
  } finally {
    if (session) await session.endSession();
  }
};

exports.updateLeadFollowUp = async (req, res) => {
  let session;
  try {
    if (!validateLeadId(req.params.id, res)) return;
    const { nextAction, nextFollowUpAt, followUpNote } = req.body || {};
    const clearing = nextFollowUpAt === null || nextFollowUpAt === "";
    let followUpDate = null;
    if (!clearing) {
      followUpDate = new Date(nextFollowUpAt);
      if (!nextFollowUpAt || !Number.isFinite(followUpDate.getTime())) {
        return sendValidationError(res, "A valid follow-up date is required.");
      }
      if (!String(nextAction || "").trim()) {
        return sendValidationError(res, "The next action is required.");
      }
    }

    session = await mongoose.startSession();
    let leadId;
    let activity;
    await session.withTransaction(async () => {
      const lead = await SalesLead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error("Lead not found.");
        error.statusCode = 404;
        throw error;
      }
      leadId = lead._id;
      lead.nextAction = clearing ? "" : String(nextAction).trim();
      lead.nextFollowUpAt = followUpDate;
      lead.followUpNote = clearing ? "" : String(followUpNote || "").trim();
      await lead.save({ session });
      const details = clearing
        ? "Scheduled follow-up cleared."
        : `Follow-up scheduled for ${followUpDate.toISOString()}: ${lead.nextAction}${lead.followUpNote ? ` — ${lead.followUpNote}` : ""}`;
      [activity] = await SalesActivity.create(
        [
          {
            lead: lead._id,
            type: "FOLLOW_UP_SCHEDULED",
            content: details,
          },
        ],
        { session },
      );
    });
    return res.json({
      success: true,
      lead: await SalesLead.findById(leadId)
        .populate("assignedTo", "_id name email")
        .lean(),
      activity,
    });
  } catch (error) {
    if (sendPersistenceValidationError(res, error)) return;
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("UPDATE SALES LEAD FOLLOW-UP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the lead follow-up.",
    });
  } finally {
    if (session) await session.endSession();
  }
};
