const ConsultationSlot = require('../models/ConsultationSlot');
const ConsultationBooking = require('../models/ConsultationBooking');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Calculate end time from start time and duration
 * @param {string} startTime - Start time in HH:MM format
 * @param {number} duration - Duration in minutes
 * @returns {string} End time in HH:MM format
 */
const calculateEndTime = (startTime, duration) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  
  const endDate = new Date(startDate.getTime() + duration * 60000);
  const endHours = String(endDate.getHours()).padStart(2, '0');
  const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
  
  return `${endHours}:${endMinutes}`;
};

/**
 * Check if two time ranges overlap
 * @param {string} start1 - Start time 1
 * @param {string} end1 - End time 1
 * @param {string} start2 - Start time 2
 * @param {string} end2 - End time 2
 * @returns {boolean} True if they overlap
 */
const timeRangesOverlap = (start1, end1, start2, end2) => {
  const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  
  return (s1 < e2 && e1 > s2);
};

/**
 * Normalize date to start of day (UTC)
 */
const normalizeDate = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// ==================== PUBLIC METHODS ====================

/**
 * Get available slots for booking
 */
const getAvailableSlots = async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;
    
    const filter = {
      status: 'available',
      isAvailable: true
    };
    
    // Filter by date or date range
    if (date) {
      const slotDate = normalizeDate(date);
      filter.date = slotDate;
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = normalizeDate(startDate);
      }
      if (endDate) {
        filter.date.$lte = normalizeDate(endDate);
      }
    } else {
      // Default: from today onwards
      filter.date = { $gte: normalizeDate(new Date()) };
    }
    
    // Get slots
    const slots = await ConsultationSlot.find(filter)
      .sort({ date: 1, startTime: 1 })
      .lean();
    
    // Get booking counts for each slot
    const slotIds = slots.map(s => s._id);
    const bookingCounts = await ConsultationBooking.aggregate([
      {
        $match: {
          slotId: { $in: slotIds },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: '$slotId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const bookingCountMap = {};
    bookingCounts.forEach(bc => {
      bookingCountMap[bc._id.toString()] = bc.count;
    });
    
    // Filter out fully booked slots and add booking count
    const availableSlots = slots
      .filter(slot => {
        const bookingCount = bookingCountMap[slot._id.toString()] || 0;
        return bookingCount < slot.maxBookings;
      })
      .map(slot => ({
        ...slot,
        bookingCount: bookingCountMap[slot._id.toString()] || 0,
        availableSpots: slot.maxBookings - (bookingCountMap[slot._id.toString()] || 0)
      }));
    
    res.status(200).json({
      success: true,
      message: 'Available slots fetched successfully',
      data: availableSlots
    });
  } catch (error) {
    logger.error('Get available slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch available slots', 500));
  }
};

/**
 * Book a consultation slot
 */
const bookConsultation = async (req, res, next) => {
  try {
    const { slotId, userName, userEmail, userPhone, message } = req.body;
    
    // Validate required fields
    if (!slotId || !userName || !userEmail || !userPhone) {
      return next(new AppError('Missing required fields: slotId, userName, userEmail, and userPhone are required', 400));
    }
    
    // Find the slot
    const slot = await ConsultationSlot.findById(slotId);
    if (!slot) {
      return next(new AppError('Consultation slot not found', 404));
    }
    
    // Check if slot is available
    if (slot.status !== 'available' || !slot.isAvailable) {
      return next(new AppError('This slot is not available for booking', 400));
    }
    
    // Check if slot is in the past
    const slotDateTime = new Date(slot.date);
    const [hours, minutes] = slot.startTime.split(':').map(Number);
    slotDateTime.setHours(hours, minutes, 0, 0);
    
    if (slotDateTime < new Date()) {
      return next(new AppError('Cannot book slots in the past', 400));
    }
    
    // Check current booking count
    const currentBookings = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    if (currentBookings >= slot.maxBookings) {
      return next(new AppError('This slot is fully booked', 400));
    }
    
    // Create booking
    const booking = await ConsultationBooking.create({
      slotId: slot._id,
      userName: userName.trim(),
      userEmail: userEmail.toLowerCase().trim(),
      userPhone: userPhone.trim(),
      message: message?.trim() || null,
      status: 'pending'
    });
    
    // Update slot status if fully booked
    if (currentBookings + 1 >= slot.maxBookings) {
      slot.status = 'booked';
      await slot.save();
    }
    
    // Populate slot details
    await booking.populate('slotId');
    
    logger.info(`Consultation booking created: ${booking._id} for slot: ${slotId}`);
    
    res.status(201).json({
      success: true,
      message: 'Consultation booked successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Book consultation error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to book consultation', 500));
  }
};

/**
 * Get booking details by ID
 */
const getBookingDetails = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await ConsultationBooking.findById(bookingId).populate('slotId');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Booking details fetched successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Get booking details error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch booking details', 500));
  }
};

/**
 * Cancel booking (user can cancel their own booking)
 */
const cancelBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { userEmail } = req.body; // User must provide email to verify
    
    if (!userEmail) {
      return next(new AppError('Email is required to cancel booking', 400));
    }
    
    const booking = await ConsultationBooking.findById(bookingId).populate('slotId');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    // Verify email matches
    if (booking.userEmail.toLowerCase() !== userEmail.toLowerCase().trim()) {
      return next(new AppError('Email does not match this booking', 403));
    }
    
    // Check if already cancelled or completed
    if (booking.status === 'cancelled') {
      return next(new AppError('Booking is already cancelled', 400));
    }
    
    if (booking.status === 'completed') {
      return next(new AppError('Cannot cancel a completed consultation', 400));
    }
    
    // Update booking
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'user';
    await booking.save();
    
    // Update slot status if needed
    const slot = await ConsultationSlot.findById(booking.slotId._id);
    if (slot && slot.status === 'booked') {
      // Check if there are still active bookings
      const activeBookings = await ConsultationBooking.countDocuments({
        slotId: slot._id,
        status: { $nin: ['cancelled'] }
      });
      
      if (activeBookings < slot.maxBookings) {
        slot.status = 'available';
        await slot.save();
      }
    }
    
    logger.info(`Booking cancelled: ${bookingId} by user`);
    
    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Cancel booking error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to cancel booking', 500));
  }
};

// ==================== ADMIN METHODS ====================

/**
 * Admin: List all slots with pagination and filters
 */
const adminListSlots = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    
    const { status, startDate, endDate, isAvailable } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = normalizeDate(startDate);
      if (endDate) filter.date.$lte = normalizeDate(endDate);
    }
    
    const slots = await ConsultationSlot.find(filter)
      .populate('createdBy', 'name email')
      .sort({ date: -1, startTime: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Get booking counts
    const slotIds = slots.map(s => s._id);
    const bookingCounts = await ConsultationBooking.aggregate([
      {
        $match: {
          slotId: { $in: slotIds },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: '$slotId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const bookingCountMap = {};
    bookingCounts.forEach(bc => {
      bookingCountMap[bc._id.toString()] = bc.count;
    });
    
    const slotsWithCounts = slots.map(slot => ({
      ...slot,
      bookingCount: bookingCountMap[slot._id.toString()] || 0
    }));
    
    const total = await ConsultationSlot.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Slots fetched successfully',
      data: {
        items: slotsWithCounts,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Admin list slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch slots', 500));
  }
};

/**
 * Admin: Get a single slot by ID
 */
const adminGetSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { slotId } = req.params;
    
    const slot = await ConsultationSlot.findById(slotId)
      .populate('createdBy', 'name email')
      .lean();
    
    if (!slot) {
      return next(new AppError('Slot not found', 404));
    }
    
    // Get booking count
    const bookingCount = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    const slotWithCount = {
      ...slot,
      bookingCount
    };
    
    res.status(200).json({
      success: true,
      message: 'Slot fetched successfully',
      data: slotWithCount
    });
  } catch (error) {
    logger.error('Admin get slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch slot', 500));
  }
};

/**
 * Admin: Create a new slot
 */
const adminCreateSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { date, startTime, duration = 30, maxBookings = 1, notes, status = 'available' } = req.body;
    
    // Validate required fields
    if (!date || !startTime) {
      return next(new AppError('Date and startTime are required', 400));
    }
    
    // Validate date is not in the past
    const slotDate = normalizeDate(date);
    const today = normalizeDate(new Date());
    if (slotDate < today) {
      return next(new AppError('Cannot create slots in the past', 400));
    }
    
    // Validate time format
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
      return next(new AppError('Start time must be in HH:MM format', 400));
    }
    
    // Calculate end time
    const endTime = calculateEndTime(startTime, duration);
    
    // Check for time conflicts (convert times to comparable format)
    const allSlotsSameDate = await ConsultationSlot.find({
      date: slotDate,
      status: { $ne: 'cancelled' }
    }).lean();
    
    const conflictingSlot = allSlotsSameDate.find(existingSlot => {
      return timeRangesOverlap(startTime, endTime, existingSlot.startTime, existingSlot.endTime);
    });
    
    if (conflictingSlot) {
      return next(new AppError('Time slot conflicts with an existing slot', 400));
    }
    
    // Create slot
    const slot = await ConsultationSlot.create({
      date: slotDate,
      startTime: startTime.trim(),
      endTime,
      duration: Number(duration),
      maxBookings: Number(maxBookings),
      notes: notes?.trim() || null,
      status,
      isAvailable: status === 'available',
      createdBy: req.user._id
    });
    
    await slot.populate('createdBy', 'name email');
    
    logger.info(`Consultation slot created: ${slot._id} by user: ${req.user._id}`);
    
    res.status(201).json({
      success: true,
      message: 'Slot created successfully',
      data: slot
    });
  } catch (error) {
    logger.error('Admin create slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create slot', 500));
  }
};

/**
 * Admin: Update a slot
 */
const adminUpdateSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { slotId } = req.params;
    const { date, startTime, duration, maxBookings, notes, status, isAvailable } = req.body;
    
    const slot = await ConsultationSlot.findById(slotId);
    if (!slot) {
      return next(new AppError('Slot not found', 404));
    }
    
    // Check if slot has bookings (some fields cannot be changed)
    const bookingCount = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    if (bookingCount > 0) {
      // If there are bookings, only allow certain updates
      if (date !== undefined || startTime !== undefined || duration !== undefined) {
        return next(new AppError('Cannot change date, startTime, or duration for slots with existing bookings', 400));
      }
    }
    
    // Update fields
    if (date !== undefined) {
      const slotDate = normalizeDate(date);
      const today = normalizeDate(new Date());
      if (slotDate < today) {
        return next(new AppError('Cannot set date in the past', 400));
      }
      slot.date = slotDate;
    }
    
    if (startTime !== undefined) {
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
        return next(new AppError('Start time must be in HH:MM format', 400));
      }
      slot.startTime = startTime.trim();
    }
    
    if (duration !== undefined) {
      slot.duration = Number(duration);
    }
    
    // Recalculate end time if startTime or duration changed
    if (startTime !== undefined || duration !== undefined) {
      slot.endTime = calculateEndTime(slot.startTime, slot.duration);
      
      // Check for time conflicts (exclude current slot)
      const allSlotsSameDate = await ConsultationSlot.find({
        _id: { $ne: slot._id },
        date: slot.date,
        status: { $ne: 'cancelled' }
      }).lean();
      
      const conflictingSlot = allSlotsSameDate.find(existingSlot => {
        return timeRangesOverlap(slot.startTime, slot.endTime, existingSlot.startTime, existingSlot.endTime);
      });
      
      if (conflictingSlot) {
        return next(new AppError('Updated time slot conflicts with an existing slot', 400));
      }
    }
    
    if (maxBookings !== undefined) {
      const newMaxBookings = Number(maxBookings);
      if (newMaxBookings < bookingCount) {
        return next(new AppError(`Cannot set maxBookings less than current booking count (${bookingCount})`, 400));
      }
      slot.maxBookings = newMaxBookings;
    }
    
    if (notes !== undefined) {
      slot.notes = notes?.trim() || null;
    }
    
    if (status !== undefined) {
      slot.status = status;
      // Update isAvailable based on status
      slot.isAvailable = status === 'available';
    }
    
    if (isAvailable !== undefined) {
      slot.isAvailable = isAvailable;
    }
    
    await slot.save();
    await slot.populate('createdBy', 'name email');
    
    logger.info(`Slot updated: ${slotId} by user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Slot updated successfully',
      data: slot
    });
  } catch (error) {
    logger.error('Admin update slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to update slot', 500));
  }
};

/**
 * Admin: Delete a slot
 */
const adminDeleteSlot = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { slotId } = req.params;
    
    const slot = await ConsultationSlot.findById(slotId);
    if (!slot) {
      return next(new AppError('Slot not found', 404));
    }
    
    // Check if slot has bookings
    const bookingCount = await ConsultationBooking.countDocuments({
      slotId: slot._id,
      status: { $nin: ['cancelled'] }
    });
    
    if (bookingCount > 0) {
      return next(new AppError('Cannot delete slot with existing bookings. Please cancel bookings first.', 400));
    }
    
    await ConsultationSlot.findByIdAndDelete(slotId);
    
    logger.info(`Slot deleted: ${slotId} by user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Slot deleted successfully'
    });
  } catch (error) {
    logger.error('Admin delete slot error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to delete slot', 500));
  }
};

/**
 * Admin: Create multiple slots in bulk
 */
const adminCreateBulkSlots = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { startDate, endDate, startTime, endTime, interval, duration = 30, maxBookings = 1, notes } = req.body;
    
    // Validate required fields
    if (!startDate || !endDate || !startTime || !endTime || !interval) {
      return next(new AppError('startDate, endDate, startTime, endTime, and interval are required', 400));
    }
    
    // Validate time formats
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return next(new AppError('Start time and end time must be in HH:MM format', 400));
    }
    
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    
    if (start > end) {
      return next(new AppError('Start date must be before or equal to end date', 400));
    }
    
    if (start < normalizeDate(new Date())) {
      return next(new AppError('Cannot create slots in the past', 400));
    }
    
    // Convert times to minutes for comparison
    const timeToMinutes = (time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    
    if (startMinutes >= endMinutes) {
      return next(new AppError('Start time must be before end time', 400));
    }
    
    const slots = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      let currentTimeMinutes = startMinutes;
      
      while (currentTimeMinutes + duration <= endMinutes) {
        const slotStartTime = `${Math.floor(currentTimeMinutes / 60).toString().padStart(2, '0')}:${(currentTimeMinutes % 60).toString().padStart(2, '0')}`;
        const slotEndTime = calculateEndTime(slotStartTime, duration);
        
        slots.push({
          date: new Date(currentDate),
          startTime: slotStartTime,
          endTime: slotEndTime,
          duration: Number(duration),
          maxBookings: Number(maxBookings),
          notes: notes?.trim() || null,
          status: 'available',
          isAvailable: true,
          createdBy: req.user._id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        currentTimeMinutes += interval;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Check for conflicts before inserting (group by date for efficiency)
    const dateGroups = {};
    slots.forEach(slot => {
      const dateKey = slot.date.toISOString().split('T')[0];
      if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
      dateGroups[dateKey].push(slot);
    });
    
    for (const [dateKey, dateSlots] of Object.entries(dateGroups)) {
      const existingSlots = await ConsultationSlot.find({
        date: new Date(dateKey),
        status: { $ne: 'cancelled' }
      }).lean();
      
      for (const slot of dateSlots) {
        const conflictingSlot = existingSlots.find(existing => {
          return timeRangesOverlap(slot.startTime, slot.endTime, existing.startTime, existing.endTime);
        });
        
        if (conflictingSlot) {
          return next(new AppError(`Slot conflict detected at ${dateKey} ${slot.startTime}. Please resolve conflicts first.`, 400));
        }
      }
    }
    
    // Insert all slots
    const createdSlots = await ConsultationSlot.insertMany(slots);
    
    logger.info(`Bulk slots created: ${createdSlots.length} slots by user: ${req.user._id}`);
    
    res.status(201).json({
      success: true,
      message: `${createdSlots.length} slots created successfully`,
      data: createdSlots
    });
  } catch (error) {
    logger.error('Admin create bulk slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create bulk slots', 500));
  }
};

/**
 * Admin: Create multiple slots for a single date
 */
const adminCreateMultipleSlots = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { date, slots } = req.body;
    
    // Validate required fields
    if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
      return next(new AppError('Date and slots array are required', 400));
    }
    
    const slotDate = normalizeDate(date);
    const today = normalizeDate(new Date());
    if (slotDate < today) {
      return next(new AppError('Cannot create slots in the past', 400));
    }
    
    // Validate all slots
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    const slotData = [];
    const errors = [];
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      
      if (!slot.startTime) {
        errors.push(`Slot ${i + 1}: Start time is required`);
        continue;
      }
      
      if (!timeRegex.test(slot.startTime)) {
        errors.push(`Slot ${i + 1}: Start time must be in HH:MM format`);
        continue;
      }
      
      const duration = slot.duration || 30;
      if (duration < 15 || duration > 480) {
        errors.push(`Slot ${i + 1}: Duration must be between 15 and 480 minutes`);
        continue;
      }
      
      const endTime = calculateEndTime(slot.startTime, duration);
      slotData.push({
        date: slotDate,
        startTime: slot.startTime.trim(),
        endTime,
        duration: Number(duration),
        maxBookings: Number(slot.maxBookings || 1),
        notes: slot.notes?.trim() || null,
        status: slot.status || 'available',
        isAvailable: (slot.status || 'available') === 'available',
        createdBy: req.user._id
      });
    }
    
    if (errors.length > 0) {
      return next(new AppError(`Validation errors: ${errors.join('; ')}`, 400));
    }
    
    // Check for conflicts with existing slots
    const existingSlots = await ConsultationSlot.find({
      date: slotDate,
      status: { $ne: 'cancelled' }
    }).lean();
    
    const conflicts = [];
    for (let i = 0; i < slotData.length; i++) {
      const slot = slotData[i];
      const conflictingSlot = existingSlots.find(existing => {
        return timeRangesOverlap(slot.startTime, slot.endTime, existing.startTime, existing.endTime);
      });
      
      if (conflictingSlot) {
        conflicts.push({
          index: i,
          startTime: slot.startTime,
          conflictingTime: `${conflictingSlot.startTime} - ${conflictingSlot.endTime}`
        });
      }
    }
    
    // Check for conflicts within the new slots themselves
    for (let i = 0; i < slotData.length; i++) {
      for (let j = i + 1; j < slotData.length; j++) {
        if (timeRangesOverlap(
          slotData[i].startTime, slotData[i].endTime,
          slotData[j].startTime, slotData[j].endTime
        )) {
          conflicts.push({
            index: i,
            startTime: slotData[i].startTime,
            conflictingTime: `${slotData[j].startTime} - ${slotData[j].endTime} (in your list)`
          });
        }
      }
    }
    
    if (conflicts.length > 0) {
      const conflictMessages = conflicts.map(c => 
        `Slot at ${c.startTime} conflicts with ${c.conflictingTime}`
      ).join('; ');
      return next(new AppError(`Time conflicts detected: ${conflictMessages}`, 400));
    }
    
    // Create all slots
    const createdSlots = await ConsultationSlot.insertMany(slotData);
    
    logger.info(`Multiple slots created: ${createdSlots.length} slots for date ${date} by user: ${req.user._id}`);
    
    res.status(201).json({
      success: true,
      message: `${createdSlots.length} slots created successfully`,
      data: createdSlots
    });
  } catch (error) {
    logger.error('Admin create multiple slots error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to create slots', 500));
  }
};

/**
 * Admin: List all bookings
 */
const adminListBookings = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    
    const { status, slotId, startDate, endDate, userEmail } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (slotId) filter.slotId = slotId;
    if (userEmail) filter.userEmail = userEmail.toLowerCase().trim();
    
    // Filter by slot date range
    if (startDate || endDate) {
      const slotFilter = {};
      if (startDate) slotFilter.$gte = normalizeDate(startDate);
      if (endDate) slotFilter.$lte = normalizeDate(endDate);
      
      const slotsInRange = await ConsultationSlot.find({ date: slotFilter }).select('_id').lean();
      const slotIds = slotsInRange.map(s => s._id);
      filter.slotId = { $in: slotIds };
    }
    
    const bookings = await ConsultationBooking.find(filter)
      .populate('slotId')
      .populate('confirmedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await ConsultationBooking.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      message: 'Bookings fetched successfully',
      data: {
        items: bookings,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Admin list bookings error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch bookings', 500));
  }
};

/**
 * Admin: Get booking details
 */
const adminGetBooking = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { bookingId } = req.params;
    
    const booking = await ConsultationBooking.findById(bookingId)
      .populate('slotId')
      .populate('confirmedBy', 'name email');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    res.status(200).json({
      success: true,
      message: 'Booking details fetched successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Admin get booking error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to fetch booking details', 500));
  }
};

/**
 * Admin: Update booking
 */
const adminUpdateBooking = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const { bookingId } = req.params;
    const { status, meetingLink, message } = req.body;
    
    const booking = await ConsultationBooking.findById(bookingId).populate('slotId');
    
    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }
    
    if (status !== undefined) {
      const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!validStatuses.includes(status)) {
        return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
      }
      
      // Handle status transitions
      if (status === 'confirmed' && booking.status !== 'confirmed') {
        booking.confirmedAt = new Date();
        booking.confirmedBy = req.user._id;
      }
      
      if (status === 'cancelled' && booking.status !== 'cancelled') {
        booking.cancelledAt = new Date();
        booking.cancelledBy = 'admin';
      }
      
      booking.status = status;
    }
    
    if (meetingLink !== undefined) {
      booking.meetingLink = meetingLink?.trim() || null;
    }
    
    if (message !== undefined) {
      booking.message = message?.trim() || null;
    }
    
    await booking.save();
    
    // Update slot status if needed
    if (booking.status === 'cancelled') {
      const slot = await ConsultationSlot.findById(booking.slotId._id);
      if (slot && slot.status === 'booked') {
        const activeBookings = await ConsultationBooking.countDocuments({
          slotId: slot._id,
          status: { $nin: ['cancelled'] }
        });
        
        if (activeBookings < slot.maxBookings) {
          slot.status = 'available';
          await slot.save();
        }
      }
    }
    
    await booking.populate('slotId');
    await booking.populate('confirmedBy', 'name email');
    
    logger.info(`Booking updated: ${bookingId} by user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Admin update booking error', { error: error.message, stack: error.stack });
    next(error instanceof AppError ? error : new AppError('Unable to update booking', 500));
  }
};

module.exports = {
  // Public methods
  getAvailableSlots,
  bookConsultation,
  getBookingDetails,
  cancelBooking,
  
  // Admin methods
  adminListSlots,
  adminGetSlot,
  adminCreateSlot,
  adminUpdateSlot,
  adminDeleteSlot,
  adminCreateBulkSlots,
  adminCreateMultipleSlots,
  adminListBookings,
  adminGetBooking,
  adminUpdateBooking
};

