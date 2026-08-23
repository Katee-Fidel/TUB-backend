const Event = require("../models/Event.js");
const { cloudinary } = require("../config/cloudinary.js");

// POST /api/events  (artist only)
async function createEvent(req, res) {
  try {
    const { title, description, venue, date, ticketPrice, totalTickets, status } = req.body;

    if (!title || !description || !venue || !date || ticketPrice === undefined || ticketPrice === "" || totalTickets === undefined || totalTickets === "") {
      return res.status(400).json({ message: "Missing required event fields" });
    }

    const event = await Event.create({
      artist: req.user.id,
      title,
      description,
      venue,
      date,
      ticketPrice,
      totalTickets,
      status: status === "published" ? "published" : "draft",
      bannerUrl: req.file?.path || "",
      bannerPublicId: req.file?.filename || "", // multer-storage-cloudinary sets this to the Cloudinary public_id
    });

    return res.status(201).json({ event });
  } catch (err) {
    console.error("createEvent error:", err);
    return res.status(500).json({ message: "Server error creating event" });
  }
}

// GET /api/events  (public — published events only, for the discovery feed)
async function getPublicEvents(req, res) {
  try {
    const events = await Event.find({ status: "published" })
      .sort({ date: 1 })
      .populate("artist", "name avatarUrl");
    return res.status(200).json({ events });
  } catch (err) {
    console.error("getPublicEvents error:", err);
    return res.status(500).json({ message: "Server error fetching events" });
  }
}

// GET /api/events/mine  (artist only — includes drafts, for their own dashboard)
async function getMyEvents(req, res) {
  try {
    const events = await Event.find({ artist: req.user.id }).sort({ createdAt: -1 });
    return res.status(200).json({ events });
  } catch (err) {
    console.error("getMyEvents error:", err);
    return res.status(500).json({ message: "Server error fetching your events" });
  }
}

// GET /api/events/:id  (public detail page)
async function getEventById(req, res) {
  try {
    const visibility = [{ status: "published" }];
    if (req.user) visibility.push({ artist: req.user.id });
    const event = await Event.findOne({ _id: req.params.id, $or: visibility }).populate("artist", "name avatarUrl");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    return res.status(200).json({ event });
  } catch (err) {
    return res.status(400).json({ message: "Invalid event id" });
  }
}

// PATCH /api/events/:id  (artist only, and only THEIR OWN event)
async function updateEvent(req, res) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // requireRole("artist") only proves they're SOME artist — this proves
    // it's THIS artist's event. Role check alone is not enough here.
    if (event.artist.toString() !== req.user.id) {
      return res.status(403).json({ message: "You do not own this event" });
    }

    const editableFields = [
      "title", "description", "venue", "date",
      "ticketPrice", "totalTickets", "status",
    ];
    for (const field of editableFields) {
      if (req.body[field] !== undefined) event[field] = req.body[field];
    }

    if (event.totalTickets < event.ticketsSold) {
      return res.status(400).json({ message: "Total tickets cannot be less than tickets already sold" });
    }

    // If a new banner was uploaded, swap it and clean up the old Cloudinary asset
    if (req.file) {
      if (event.bannerPublicId) {
        await cloudinary.uploader.destroy(event.bannerPublicId).catch(() => {});
      }
      event.bannerUrl = req.file.path;
      event.bannerPublicId = req.file.filename;
    }

    await event.save();
    return res.status(200).json({ event });
  } catch (err) {
    console.error("updateEvent error:", err);
    return res.status(500).json({ message: "Server error updating event" });
  }
}

// DELETE /api/events/:id  (artist only, and only THEIR OWN event)
async function deleteEvent(req, res) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (event.artist.toString() !== req.user.id) {
      return res.status(403).json({ message: "You do not own this event" });
    }

    if (event.bannerPublicId) {
      await cloudinary.uploader.destroy(event.bannerPublicId).catch(() => {});
    }
    await event.deleteOne();

    return res.status(200).json({ message: "Event deleted" });
  } catch (err) {
    console.error("deleteEvent error:", err);
    return res.status(500).json({ message: "Server error deleting event" });
  }
}

module.exports = {
  createEvent,
  getPublicEvents,
  getMyEvents,
  getEventById,
  updateEvent,
  deleteEvent,
};