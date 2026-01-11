const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// ============================================
// CONFIGURATION & SETUP
// ============================================

const app = express();
app.use(express.json());

const JWT_SECRET = 'your-secret-key-change-in-production';
const PORT = 3000;

// ============================================
// IN-MEMORY DATABASE
// ============================================

const db = {
  users: [],
  events: [],
  bookings: [],
  jobQueue: []
};

// ============================================
// BACKGROUND JOB QUEUE SYSTEM
// ============================================

class JobQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(job) {
    this.queue.push({
      id: uuidv4(),
      ...job,
      status: 'pending',
      createdAt: new Date()
    });
    console.log(`[JOB QUEUE] Job enqueued: ${job.type}`);
    this.process();
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      job.status = 'processing';
      
      try {
        await this.executeJob(job);
        job.status = 'completed';
        console.log(`[JOB QUEUE] Job completed: ${job.id}`);
      } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        console.error(`[JOB QUEUE] Job failed: ${job.id}`, error);
      }
    }
    
    this.processing = false;
  }

  async executeJob(job) {
    // Simulate async processing delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    switch (job.type) {
      case 'BOOKING_CONFIRMATION':
        await this.sendBookingConfirmation(job.data);
        break;
      case 'EVENT_UPDATE_NOTIFICATION':
        await this.sendEventUpdateNotification(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  async sendBookingConfirmation(data) {
    const { booking, customer, event } = data;
    
    console.log('\n' + '='.repeat(60));
    console.log('📧 BOOKING CONFIRMATION EMAIL');
    console.log('='.repeat(60));
    console.log(`To: ${customer.email}`);
    console.log(`Subject: Booking Confirmation - ${event.name}`);
    console.log('-'.repeat(60));
    console.log(`Dear ${customer.name},`);
    console.log(`\nYour booking has been confirmed!`);
    console.log(`\nBooking Details:`);
    console.log(`  Booking ID: ${booking.id}`);
    console.log(`  Event: ${event.name}`);
    console.log(`  Date: ${new Date(event.date).toLocaleString()}`);
    console.log(`  Location: ${event.location}`);
    console.log(`  Tickets: ${booking.ticketCount}`);
    console.log(`  Total Amount: $${booking.totalAmount}`);
    console.log(`\nThank you for your booking!`);
    console.log('='.repeat(60) + '\n');
  }

  async sendEventUpdateNotification(data) {
    const { event, customers, updateFields } = data;
    
    console.log('\n' + '='.repeat(60));
    console.log('📢 EVENT UPDATE NOTIFICATION');
    console.log('='.repeat(60));
    console.log(`Event: ${event.name}`);
    console.log(`Updated Fields: ${updateFields.join(', ')}`);
    console.log(`Notifying ${customers.length} customer(s)`);
    console.log('-'.repeat(60));
    
    customers.forEach(customer => {
      console.log(`\n📧 To: ${customer.email}`);
      console.log(`Subject: Update for ${event.name}`);
      console.log(`Dear ${customer.name},`);
      console.log(`\nThe event "${event.name}" has been updated.`);
      console.log(`\nUpdated Information:`);
      updateFields.forEach(field => {
        console.log(`  ${field}: ${event[field]}`);
      });
      console.log(`\nPlease review the changes.`);
    });
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

const jobQueue = new JobQueue();

// ============================================
// MIDDLEWARE
// ============================================

// Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = db.users.find(u => u.id === decoded.userId);
    
    if (!req.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based Authorization Middleware
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }
    next();
  };
};

// ============================================
// AUTH ROUTES
// ============================================

// Register User
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role } = req.body;
  
  // Validation
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (!['organizer', 'customer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either "organizer" or "customer"' });
  }
  
  // Check if user exists
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  // Create user
  const user = {
    id: uuidv4(),
    email,
    password, // In production, hash this!
    name,
    role,
    createdAt: new Date()
  };
  
  db.users.push(user);
  
  // Generate token
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  
  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    token
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = db.users.find(u => u.email === email && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    token
  });
});

// ============================================
// EVENT ROUTES (Organizer Only)
// ============================================

// Create Event
app.post('/api/events', authenticate, authorize('organizer'), (req, res) => {
  const { name, description, date, location, ticketPrice, totalTickets } = req.body;
  
  // Validation
  if (!name || !description || !date || !location || ticketPrice === undefined || !totalTickets) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const event = {
    id: uuidv4(),
    organizerId: req.user.id,
    name,
    description,
    date: new Date(date),
    location,
    ticketPrice: parseFloat(ticketPrice),
    totalTickets: parseInt(totalTickets),
    availableTickets: parseInt(totalTickets),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  db.events.push(event);
  
  res.status(201).json({
    message: 'Event created successfully',
    event
  });
});

// Update Event
app.put('/api/events/:eventId', authenticate, authorize('organizer'), (req, res) => {
  const { eventId } = req.params;
  const event = db.events.find(e => e.id === eventId);
  
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  // Check ownership
  if (event.organizerId !== req.user.id) {
    return res.status(403).json({ error: 'You can only update your own events' });
  }
  
  const allowedUpdates = ['name', 'description', 'date', 'location', 'ticketPrice'];
  const updateFields = [];
  
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      event[field] = field === 'date' ? new Date(req.body[field]) : req.body[field];
      updateFields.push(field);
    }
  });
  
  event.updatedAt = new Date();
  
  // Background Task: Notify all customers who booked this event
  const eventBookings = db.bookings.filter(b => b.eventId === eventId);
  
  if (eventBookings.length > 0 && updateFields.length > 0) {
    const customers = eventBookings.map(booking => 
      db.users.find(u => u.id === booking.customerId)
    ).filter((customer, index, self) => 
      self.findIndex(c => c.id === customer.id) === index // Remove duplicates
    );
    
    jobQueue.enqueue({
      type: 'EVENT_UPDATE_NOTIFICATION',
      data: {
        event,
        customers,
        updateFields
      }
    });
  }
  
  res.json({
    message: 'Event updated successfully',
    event,
    notificationsSent: eventBookings.length > 0
  });
});

// Delete Event
app.delete('/api/events/:eventId', authenticate, authorize('organizer'), (req, res) => {
  const { eventId } = req.params;
  const eventIndex = db.events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  if (db.events[eventIndex].organizerId !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own events' });
  }
  
  db.events.splice(eventIndex, 1);
  
  res.json({ message: 'Event deleted successfully' });
});

// Get Organizer's Events
app.get('/api/events/my-events', authenticate, authorize('organizer'), (req, res) => {
  const events = db.events.filter(e => e.organizerId === req.user.id);
  
  const eventsWithBookings = events.map(event => ({
    ...event,
    bookingsCount: db.bookings.filter(b => b.eventId === event.id).length,
    ticketsSold: event.totalTickets - event.availableTickets
  }));
  
  res.json({ events: eventsWithBookings });
});

// ============================================
// EVENT ROUTES (Public/Customer)
// ============================================

// Get All Events (Public)
app.get('/api/events', (req, res) => {
  const { search, date, location } = req.query;
  
  let filteredEvents = [...db.events];
  
  if (search) {
    filteredEvents = filteredEvents.filter(e => 
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase())
    );
  }
  
  if (date) {
    const searchDate = new Date(date).toDateString();
    filteredEvents = filteredEvents.filter(e => 
      new Date(e.date).toDateString() === searchDate
    );
  }
  
  if (location) {
    filteredEvents = filteredEvents.filter(e => 
      e.location.toLowerCase().includes(location.toLowerCase())
    );
  }
  
  res.json({ events: filteredEvents });
});

// Get Single Event (Public)
app.get('/api/events/:eventId', (req, res) => {
  const event = db.events.find(e => e.id === req.params.eventId);
  
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  res.json({ event });
});

// ============================================
// BOOKING ROUTES (Customer Only)
// ============================================

// Create Booking
app.post('/api/bookings', authenticate, authorize('customer'), (req, res) => {
  const { eventId, ticketCount } = req.body;
  
  if (!eventId || !ticketCount || ticketCount < 1) {
    return res.status(400).json({ error: 'Valid eventId and ticketCount are required' });
  }
  
  const event = db.events.find(e => e.id === eventId);
  
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  
  if (event.availableTickets < ticketCount) {
    return res.status(400).json({ 
      error: 'Not enough tickets available',
      available: event.availableTickets,
      requested: ticketCount
    });
  }
  
  // Create booking
  const booking = {
    id: uuidv4(),
    customerId: req.user.id,
    eventId,
    ticketCount: parseInt(ticketCount),
    totalAmount: event.ticketPrice * ticketCount,
    bookingDate: new Date(),
    status: 'confirmed'
  };
  
  db.bookings.push(booking);
  
  // Update available tickets
  event.availableTickets -= ticketCount;
  
  // Background Task: Send booking confirmation email
  jobQueue.enqueue({
    type: 'BOOKING_CONFIRMATION',
    data: {
      booking,
      customer: req.user,
      event
    }
  });
  
  res.status(201).json({
    message: 'Booking created successfully',
    booking: {
      ...booking,
      event: {
        name: event.name,
        date: event.date,
        location: event.location
      }
    }
  });
});

// Get Customer's Bookings
app.get('/api/bookings/my-bookings', authenticate, authorize('customer'), (req, res) => {
  const bookings = db.bookings.filter(b => b.customerId === req.user.id);
  
  const bookingsWithEvents = bookings.map(booking => ({
    ...booking,
    event: db.events.find(e => e.id === booking.eventId)
  }));
  
  res.json({ bookings: bookingsWithEvents });
});

// Cancel Booking
app.delete('/api/bookings/:bookingId', authenticate, authorize('customer'), (req, res) => {
  const { bookingId } = req.params;
  const bookingIndex = db.bookings.findIndex(b => b.id === bookingId);
  
  if (bookingIndex === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  
  const booking = db.bookings[bookingIndex];
  
  if (booking.customerId !== req.user.id) {
    return res.status(403).json({ error: 'You can only cancel your own bookings' });
  }
  
  // Restore tickets
  const event = db.events.find(e => e.id === booking.eventId);
  if (event) {
    event.availableTickets += booking.ticketCount;
  }
  
  db.bookings.splice(bookingIndex, 1);
  
  res.json({ message: 'Booking cancelled successfully' });
});

// ============================================
// ANALYTICS ROUTES (Organizer Only)
// ============================================

app.get('/api/analytics/overview', authenticate, authorize('organizer'), (req, res) => {
  const organizerEvents = db.events.filter(e => e.organizerId === req.user.id);
  const organizerEventIds = organizerEvents.map(e => e.id);
  const organizerBookings = db.bookings.filter(b => organizerEventIds.includes(b.eventId));
  
  const totalRevenue = organizerBookings.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalTicketsSold = organizerBookings.reduce((sum, b) => sum + b.ticketCount, 0);
  
  res.json({
    totalEvents: organizerEvents.length,
    totalBookings: organizerBookings.length,
    totalTicketsSold,
    totalRevenue,
    events: organizerEvents.map(event => ({
      id: event.id,
      name: event.name,
      bookings: organizerBookings.filter(b => b.eventId === event.id).length,
      revenue: organizerBookings
        .filter(b => b.eventId === event.id)
        .reduce((sum, b) => sum + b.totalAmount, 0),
      ticketsSold: event.totalTickets - event.availableTickets
    }))
  });
});

// ============================================
// SERVER START
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Event Booking System API Server Running`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Base URL: http://localhost:${PORT}`);
  console.log(`${'='.repeat(60)}\n`);
  
  console.log('📚 Available Endpoints:\n');
  console.log('Authentication:');
  console.log('  POST   /api/auth/register');
  console.log('  POST   /api/auth/login\n');
  
  console.log('Events (Organizer):');
  console.log('  POST   /api/events');
  console.log('  PUT    /api/events/:eventId');
  console.log('  DELETE /api/events/:eventId');
  console.log('  GET    /api/events/my-events\n');
  
  console.log('Events (Public):');
  console.log('  GET    /api/events');
  console.log('  GET    /api/events/:eventId\n');
  
  console.log('Bookings (Customer):');
  console.log('  POST   /api/bookings');
  console.log('  GET    /api/bookings/my-bookings');
  console.log('  DELETE /api/bookings/:bookingId\n');
  
  console.log('Analytics (Organizer):');
  console.log('  GET    /api/analytics/overview\n');
  
  console.log(`${'='.repeat(60)}\n`);
});