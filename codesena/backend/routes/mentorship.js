const express = require('express');
const { body, validationResult } = require('express-validator');
const Mentorship = require('../models/Mentorship');
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

// Get all mentorship questions (with filters and pagination)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      difficulty, 
      status, 
      priority,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
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
    
    // Filter by priority
    if (priority) {
      query.priority = priority;
    }
    
    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const questions = await Mentorship.find(query)
      .populate('asker', 'username firstName lastName avatar level')
      .populate('answers.mentor', 'username firstName lastName avatar level')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Mentorship.countDocuments(query);
    
    res.json({
      questions,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + questions.length < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Get mentorship questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get question by ID
router.get('/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const question = await Mentorship.findById(questionId)
      .populate('asker', 'username firstName lastName avatar level bio')
      .populate('answers.mentor', 'username firstName lastName avatar level bio')
      .populate('upvotes', 'username firstName lastName avatar')
      .populate('downvotes', 'username firstName lastName avatar');
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Increment views
    await question.incrementViews();
    
    res.json({ question });
    
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Ask a new question
router.post('/', authenticateToken, [
  body('question')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Question must be between 10 and 1000 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('category')
    .isIn(['DSA', 'Java Backend', 'MERN Stack', 'DevOps', 'AI/ML', 'Mobile Development', 'Web Development', 'Database', 'System Design', 'Other'])
    .withMessage('Invalid category'),
  body('difficulty')
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid difficulty level'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      question,
      description,
      category,
      difficulty,
      tags,
      priority = 'medium'
    } = req.body;
    
    const mentorship = new Mentorship({
      question,
      description,
      category,
      difficulty,
      tags: tags || [],
      asker: req.user.userId,
      priority
    });
    
    await mentorship.save();
    
    // Update user's mentorship stats
    const user = await User.findById(req.user.userId);
    user.mentorshipStats.questionsAsked += 1;
    await user.save();
    
    const populatedQuestion = await Mentorship.findById(mentorship._id)
      .populate('asker', 'username firstName lastName avatar level');
    
    res.status(201).json({
      message: 'Question posted successfully',
      question: populatedQuestion
    });
    
  } catch (error) {
    console.error('Ask question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Answer a question
router.post('/:questionId/answer', authenticateToken, [
  body('answer')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Answer must be between 10 and 5000 characters'),
  body('codeSnippet')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Code snippet cannot exceed 2000 characters'),
  body('resources')
    .optional()
    .isArray()
    .withMessage('Resources must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { questionId } = req.params;
    const { answer, codeSnippet, resources } = req.body;
    
    const question = await Mentorship.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if user is not answering their own question
    if (question.asker.toString() === req.user.userId) {
      return res.status(400).json({ message: 'Cannot answer your own question' });
    }
    
    // Check if user has already answered
    const existingAnswer = question.answers.find(
      ans => ans.mentor.toString() === req.user.userId
    );
    if (existingAnswer) {
      return res.status(400).json({ message: 'You have already answered this question' });
    }
    
    await question.addAnswer(req.user.userId, {
      answer,
      codeSnippet,
      resources: resources || []
    });
    
    // Update user's mentorship stats
    const user = await User.findById(req.user.userId);
    user.mentorshipStats.questionsAnswered += 1;
    await user.save();
    
    const updatedQuestion = await Mentorship.findById(questionId)
      .populate('asker', 'username firstName lastName avatar level')
      .populate('answers.mentor', 'username firstName lastName avatar level');
    
    res.json({
      message: 'Answer posted successfully',
      question: updatedQuestion
    });
    
  } catch (error) {
    console.error('Answer question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept an answer
router.post('/:questionId/accept/:answerId', authenticateToken, async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    
    const question = await Mentorship.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if user is the asker
    if (question.asker.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the asker can accept answers' });
    }
    
    // Check if question is already resolved
    if (question.isResolved) {
      return res.status(400).json({ message: 'Question is already resolved' });
    }
    
    await question.acceptAnswer(answerId);
    
    // Award points to the mentor
    const acceptedAnswer = question.answers.id(answerId);
    if (acceptedAnswer) {
      const mentor = await User.findById(acceptedAnswer.mentor);
      if (mentor) {
        await mentor.addPoints(acceptedAnswer.pointsAwarded);
      }
    }
    
    const updatedQuestion = await Mentorship.findById(questionId)
      .populate('asker', 'username firstName lastName avatar level')
      .populate('answers.mentor', 'username firstName lastName avatar level');
    
    res.json({
      message: 'Answer accepted successfully',
      question: updatedQuestion
    });
    
  } catch (error) {
    console.error('Accept answer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle upvote on question
router.post('/:questionId/upvote', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const question = await Mentorship.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    await question.toggleUpvote(req.user.userId);
    
    const updatedQuestion = await Mentorship.findById(questionId)
      .populate('upvotes', 'username firstName lastName avatar')
      .populate('downvotes', 'username firstName lastName avatar');
    
    res.json({
      message: 'Upvote toggled successfully',
      question: updatedQuestion
    });
    
  } catch (error) {
    console.error('Toggle upvote error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle downvote on question
router.post('/:questionId/downvote', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const question = await Mentorship.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    await question.toggleDownvote(req.user.userId);
    
    const updatedQuestion = await Mentorship.findById(questionId)
      .populate('upvotes', 'username firstName lastName avatar')
      .populate('downvotes', 'username firstName lastName avatar');
    
    res.json({
      message: 'Downvote toggled successfully',
      question: updatedQuestion
    });
    
  } catch (error) {
    console.error('Toggle downvote error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Request a mentorship session
router.post('/:questionId/session', authenticateToken, [
  body('mentorId')
    .notEmpty()
    .withMessage('Mentor ID is required'),
  body('proposedTime')
    .isISO8601()
    .withMessage('Proposed time must be a valid date'),
  body('duration')
    .optional()
    .isInt({ min: 15, max: 120 })
    .withMessage('Duration must be between 15 and 120 minutes'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { questionId } = req.params;
    const { mentorId, proposedTime, duration = 30, notes } = req.body;
    
    const question = await Mentorship.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if user is the asker
    if (question.asker.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only the asker can request sessions' });
    }
    
    // Check if mentor exists
    const mentor = await User.findById(mentorId);
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found' });
    }
    
    await question.requestSession(req.user.userId, mentorId, {
      proposedTime: new Date(proposedTime),
      duration,
      notes
    });
    
    const updatedQuestion = await Mentorship.findById(questionId)
      .populate('asker', 'username firstName lastName avatar')
      .populate('sessionRequests.mentor', 'username firstName lastName avatar');
    
    res.json({
      message: 'Session request sent successfully',
      question: updatedQuestion
    });
    
  } catch (error) {
    console.error('Request session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update session request status
router.put('/:questionId/session/:sessionId', authenticateToken, [
  body('status')
    .isIn(['accepted', 'rejected', 'completed', 'cancelled'])
    .withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { questionId, sessionId } = req.params;
    const { status } = req.body;
    
    const question = await Mentorship.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    const sessionRequest = question.sessionRequests.id(sessionId);
    if (!sessionRequest) {
      return res.status(404).json({ message: 'Session request not found' });
    }
    
    // Check if user is the mentor or requester
    const isMentor = sessionRequest.mentor.toString() === req.user.userId;
    const isRequester = sessionRequest.requester.toString() === req.user.userId;
    
    if (!isMentor && !isRequester) {
      return res.status(403).json({ message: 'Not authorized to update this session' });
    }
    
    sessionRequest.status = status;
    
    // Update mentorship stats if session is completed
    if (status === 'completed') {
      const mentor = await User.findById(sessionRequest.mentor);
      const requester = await User.findById(sessionRequest.requester);
      
      if (mentor) {
        mentor.mentorshipStats.sessionsConducted += 1;
        await mentor.save();
      }
      
      if (requester) {
        requester.mentorshipStats.sessionsAttended += 1;
        await requester.save();
      }
    }
    
    await question.save();
    
    const updatedQuestion = await Mentorship.findById(questionId)
      .populate('asker', 'username firstName lastName avatar')
      .populate('sessionRequests.mentor', 'username firstName lastName avatar')
      .populate('sessionRequests.requester', 'username firstName lastName avatar');
    
    res.json({
      message: 'Session status updated successfully',
      question: updatedQuestion
    });
    
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search questions
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;
    
    const questions = await Mentorship.find({
      $text: { $search: query }
    })
    .populate('asker', 'username firstName lastName avatar level')
    .populate('answers.mentor', 'username firstName lastName avatar level')
    .limit(parseInt(limit));
    
    res.json({ questions });
    
  } catch (error) {
    console.error('Search questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get trending questions
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const questions = await Mentorship.find({})
      .populate('asker', 'username firstName lastName avatar level')
      .populate('answers.mentor', 'username firstName lastName avatar level')
      .sort({ views: -1, 'answers.length': -1, createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ questions });
    
  } catch (error) {
    console.error('Get trending questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;