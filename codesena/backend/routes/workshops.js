const express = require('express');
const { body, validationResult } = require('express-validator');
const Workshop = require('../models/Workshop');
const User = require('../models/User');

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'codesena-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Get all workshops (with filters and pagination)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      search, 
      category, 
      difficulty, 
      status, 
      featured,
      upcoming,
      sortBy = 'startDate',
      sortOrder = 'asc'
    } = req.query;
    
    const query = { isPublic: true };
    
    // Search functionality
    if (search) {
      query.$text = { $search: search };
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by difficulty
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter featured workshops
    if (featured === 'true') {
      query.isFeatured = true;
    }
    
    // Filter upcoming workshops
    if (upcoming === 'true') {
      query.startDate = { $gte: new Date() };
    }
    
    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const workshops = await Workshop.find(query)
      .populate('instructor', 'username firstName lastName avatar level')
      .populate('coInstructors', 'username firstName lastName avatar level')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Workshop.countDocuments(query);
    
    res.json({
      workshops,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + workshops.length < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Get workshops error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get workshop by ID
router.get('/:workshopId', async (req, res) => {
  try {
    const { workshopId } = req.params;
    
    const workshop = await Workshop.findById(workshopId)
      .populate('instructor', 'username firstName lastName avatar level bio')
      .populate('coInstructors', 'username firstName lastName avatar level')
      .populate('participants.user', 'username firstName lastName avatar')
      .populate('feedback.participant', 'username firstName lastName avatar');
    
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    res.json({ workshop });
    
  } catch (error) {
    console.error('Get workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new workshop
router.post('/', authenticateToken, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .isIn(['DSA', 'Java Backend', 'MERN Stack', 'DevOps', 'AI/ML', 'Mobile Development', 'Web Development', 'Database', 'System Design', 'Interview Prep', 'Other'])
    .withMessage('Invalid category'),
  body('difficulty')
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid difficulty level'),
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid date'),
  body('duration')
    .isInt({ min: 1, max: 48 })
    .withMessage('Duration must be between 1 and 48 hours'),
  body('venue')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Venue is required'),
  body('maxParticipants')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Max participants must be between 1 and 1000')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      title,
      description,
      shortDescription,
      category,
      difficulty,
      startDate,
      endDate,
      duration,
      venue,
      isOnline = false,
      meetingLink,
      maxParticipants = 50,
      tags,
      prerequisites,
      learningOutcomes,
      tools,
      agenda,
      materials,
      cost = 0,
      currency = 'INR'
    } = req.body;
    
    const workshop = new Workshop({
      title,
      description,
      shortDescription,
      category,
      difficulty,
      instructor: req.user.userId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      duration,
      venue,
      isOnline,
      meetingLink,
      maxParticipants,
      tags: tags || [],
      prerequisites: prerequisites || [],
      learningOutcomes: learningOutcomes || [],
      tools: tools || [],
      agenda: agenda || [],
      materials: materials || [],
      cost,
      currency
    });
    
    await workshop.save();
    
    // Add workshop to instructor's workshops
    const user = await User.findById(req.user.userId);
    user.workshops.push(workshop._id);
    await user.save();
    
    const populatedWorkshop = await Workshop.findById(workshop._id)
      .populate('instructor', 'username firstName lastName avatar');
    
    res.status(201).json({
      message: 'Workshop created successfully',
      workshop: populatedWorkshop
    });
    
  } catch (error) {
    console.error('Create workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update workshop
router.put('/:workshopId', authenticateToken, [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .optional()
    .isIn(['DSA', 'Java Backend', 'MERN Stack', 'DevOps', 'AI/ML', 'Mobile Development', 'Web Development', 'Database', 'System Design', 'Interview Prep', 'Other'])
    .withMessage('Invalid category'),
  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid difficulty level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { workshopId } = req.params;
    const updateData = req.body;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    // Check if user is the instructor
    if (workshop.instructor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to update this workshop' });
    }
    
    // Update workshop
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        if (key === 'startDate' || key === 'endDate') {
          workshop[key] = new Date(updateData[key]);
        } else {
          workshop[key] = updateData[key];
        }
      }
    });
    
    await workshop.save();
    
    const updatedWorkshop = await Workshop.findById(workshopId)
      .populate('instructor', 'username firstName lastName avatar')
      .populate('coInstructors', 'username firstName lastName avatar');
    
    res.json({
      message: 'Workshop updated successfully',
      workshop: updatedWorkshop
    });
    
  } catch (error) {
    console.error('Update workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete workshop
router.delete('/:workshopId', authenticateToken, async (req, res) => {
  try {
    const { workshopId } = req.params;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    // Check if user is the instructor
    if (workshop.instructor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this workshop' });
    }
    
    await Workshop.findByIdAndDelete(workshopId);
    
    // Remove workshop from instructor's workshops
    const user = await User.findById(req.user.userId);
    user.workshops = user.workshops.filter(id => id.toString() !== workshopId);
    await user.save();
    
    res.json({ message: 'Workshop deleted successfully' });
    
  } catch (error) {
    console.error('Delete workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Enroll in workshop
router.post('/:workshopId/enroll', authenticateToken, async (req, res) => {
  try {
    const { workshopId } = req.params;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    // Check if workshop is available
    if (!workshop.isAvailable) {
      return res.status(400).json({ message: 'Workshop is not available for enrollment' });
    }
    
    // Check if user is not the instructor
    if (workshop.instructor.toString() === req.user.userId) {
      return res.status(400).json({ message: 'Instructor cannot enroll in their own workshop' });
    }
    
    await workshop.enrollParticipant(req.user.userId);
    
    // Add workshop to user's workshops
    const user = await User.findById(req.user.userId);
    user.workshops.push(workshopId);
    await user.save();
    
    const updatedWorkshop = await Workshop.findById(workshopId)
      .populate('instructor', 'username firstName lastName avatar')
      .populate('participants.user', 'username firstName lastName avatar');
    
    res.json({
      message: 'Enrolled in workshop successfully',
      workshop: updatedWorkshop
    });
    
  } catch (error) {
    console.error('Enroll in workshop error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Unenroll from workshop
router.delete('/:workshopId/enroll', authenticateToken, async (req, res) => {
  try {
    const { workshopId } = req.params;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    await workshop.unenrollParticipant(req.user.userId);
    
    // Remove workshop from user's workshops
    const user = await User.findById(req.user.userId);
    user.workshops = user.workshops.filter(id => id.toString() !== workshopId);
    await user.save();
    
    const updatedWorkshop = await Workshop.findById(workshopId)
      .populate('instructor', 'username firstName lastName avatar')
      .populate('participants.user', 'username firstName lastName avatar');
    
    res.json({
      message: 'Unenrolled from workshop successfully',
      workshop: updatedWorkshop
    });
    
  } catch (error) {
    console.error('Unenroll from workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark attendance
router.put('/:workshopId/attendance/:userId', authenticateToken, [
  body('attended')
    .isBoolean()
    .withMessage('Attendance must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { workshopId, userId } = req.params;
    const { attended } = req.body;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    // Check if user is the instructor
    if (workshop.instructor.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only instructor can mark attendance' });
    }
    
    await workshop.markAttendance(userId, attended);
    
    const updatedWorkshop = await Workshop.findById(workshopId)
      .populate('participants.user', 'username firstName lastName avatar');
    
    res.json({
      message: 'Attendance marked successfully',
      workshop: updatedWorkshop
    });
    
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add feedback to workshop
router.post('/:workshopId/feedback', authenticateToken, [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { workshopId } = req.params;
    const { rating, comment } = req.body;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    // Check if user is enrolled
    const isEnrolled = workshop.participants.some(p => p.user.toString() === req.user.userId);
    if (!isEnrolled) {
      return res.status(403).json({ message: 'Only enrolled participants can provide feedback' });
    }
    
    await workshop.addFeedback(req.user.userId, { rating, comment });
    
    const updatedWorkshop = await Workshop.findById(workshopId)
      .populate('feedback.participant', 'username firstName lastName avatar');
    
    res.json({
      message: 'Feedback added successfully',
      workshop: updatedWorkshop
    });
    
  } catch (error) {
    console.error('Add feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit assignment
router.post('/:workshopId/assignment/:assignmentId', authenticateToken, [
  body('submission')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Submission is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { workshopId, assignmentId } = req.params;
    const { submission } = req.body;
    
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      return res.status(404).json({ message: 'Workshop not found' });
    }
    
    // Check if user is enrolled
    const isEnrolled = workshop.participants.some(p => p.user.toString() === req.user.userId);
    if (!isEnrolled) {
      return res.status(403).json({ message: 'Only enrolled participants can submit assignments' });
    }
    
    await workshop.submitAssignment(req.user.userId, assignmentId, submission);
    
    const updatedWorkshop = await Workshop.findById(workshopId);
    
    res.json({
      message: 'Assignment submitted successfully',
      workshop: updatedWorkshop
    });
    
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search workshops
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;
    
    const workshops = await Workshop.find({
      $text: { $search: query },
      isPublic: true
    })
    .populate('instructor', 'username firstName lastName avatar')
    .populate('coInstructors', 'username firstName lastName avatar')
    .limit(parseInt(limit));
    
    res.json({ workshops });
    
  } catch (error) {
    console.error('Search workshops error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get upcoming workshops
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const workshops = await Workshop.find({
      startDate: { $gte: new Date() },
      isPublic: true
    })
    .populate('instructor', 'username firstName lastName avatar')
    .populate('coInstructors', 'username firstName lastName avatar')
    .sort({ startDate: 1 })
    .limit(parseInt(limit));
    
    res.json({ workshops });
    
  } catch (error) {
    console.error('Get upcoming workshops error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;