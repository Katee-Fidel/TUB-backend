const Event = require('../models/Event.js');
const Ticket = require('../models/Ticket.js');

async function getArtistDashboard(req, res) {
  try {
    const events = await Event.find({ artist: req.user.id }).sort({ date: 1, createdAt: -1 });
    const eventIds = events.map((event) => event._id);

    const [summaryRows, upcomingTickets] = await Promise.all([
      Ticket.aggregate([
        { $match: { event: { $in: eventIds } } },
        { $group: {
          _id: '$status',
          quantity: { $sum: '$quantity' },
          revenue: { $sum: '$totalAmount' },
        } },
      ]),
      Ticket.find({ event: { $in: eventIds }, status: { $in: ['paid', 'used'] } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('event', 'title date venue')
        .populate('user', 'name email')
        .select('event user quantity totalAmount status paymentMethod createdAt'),
    ]);

    const byStatus = Object.fromEntries(summaryRows.map((row) => [row._id, row]));
    const paid = byStatus.paid?.quantity || 0;
    const used = byStatus.used?.quantity || 0;
    const pending = byStatus.pending?.quantity || 0;
    const cancelled = byStatus.cancelled?.quantity || 0;
    const revenue = (byStatus.paid?.revenue || 0) + (byStatus.used?.revenue || 0);
    const capacity = events.reduce((sum, event) => sum + Number(event.totalTickets || 0), 0);

    return res.status(200).json({
      summary: {
        totalEvents: events.length,
        publishedEvents: events.filter((event) => event.status === 'published').length,
        draftEvents: events.filter((event) => event.status === 'draft').length,
        capacity,
        ticketsSold: paid + used,
        ticketsRemaining: Math.max(0, capacity - paid - used),
        revenue,
        checkIns: used,
        pendingTickets: pending,
        cancelledTickets: cancelled,
      },
      events,
      recentSales: upcomingTickets,
    });
  } catch (err) {
    console.error('getArtistDashboard error:', err);
    return res.status(500).json({ message: 'Server error fetching artist dashboard' });
  }
}

module.exports = { getArtistDashboard };
