const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
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

// Get all projects (with filters and pagination)
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
      sortBy = 'createdAt',
      sortOrder = 'desc'
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
    
    // Filter featured projects
    if (featured === 'true') {
      query.isFeatured = true;
    }
    
    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const projects = await Project.find(query)
      .populate('owner', 'username firstName lastName avatar')
      .populate('team.user', 'username firstName lastName avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Project.countDocuments(query);
    
    res.json({
      projects,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + projects.length < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get project by ID
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await Project.findById(projectId)
      .populate('owner', 'username firstName lastName avatar bio')
      .populate('team.user', 'username firstName lastName avatar')
      .populate('likes', 'username firstName lastName avatar');
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Increment views
    await project.incrementViews();
    
    res.json({ project });
    
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new project
router.post('/', authenticateToken, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .isIn(['Web Development', 'Mobile App', 'AI/ML', 'Data Science', 'DevOps', 'Game Development', 'IoT', 'Blockchain', 'Other'])
    .withMessage('Invalid category'),
  body('difficulty')
    .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
    .withMessage('Invalid difficulty level'),
  body('technologies')
    .optional()
    .isArray()
    .withMessage('Technologies must be an array'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
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
      technologies,
      tags,
      estimatedDuration,
      learningOutcomes,
      requirements
    } = req.body;
    
    const project = new Project({
      title,
      description,
      shortDescription,
      category,
      difficulty,
      technologies: technologies || [],
      tags: tags || [],
      owner: req.user.userId,
      estimatedDuration,
      learningOutcomes: learningOutcomes || [],
      requirements: requirements || []
    });
    
    await project.save();
    
    // Add project to user's projects
    const user = await User.findById(req.user.userId);
    user.projects.push(project._id);
    await user.save();
    
    const populatedProject = await Project.findById(project._id)
      .populate('owner', 'username firstName lastName avatar');
    
    res.status(201).json({
      message: 'Project created successfully',
      project: populatedProject
    });
    
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update project
router.put('/:projectId', authenticateToken, [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .optional()
    .isIn(['Web Development', 'Mobile App', 'AI/ML', 'Data Science', 'DevOps', 'Game Development', 'IoT', 'Blockchain', 'Other'])
    .withMessage('Invalid category'),
  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced', 'expert'])
    .withMessage('Invalid difficulty level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { projectId } = req.params;
    const updateData = req.body;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user is the owner
    if (project.owner.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to update this project' });
    }
    
    // Update project
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        project[key] = updateData[key];
      }
    });
    
    await project.save();
    
    const updatedProject = await Project.findById(projectId)
      .populate('owner', 'username firstName lastName avatar')
      .populate('team.user', 'username firstName lastName avatar');
    
    res.json({
      message: 'Project updated successfully',
      project: updatedProject
    });
    
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete project
router.delete('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user is the owner
    if (project.owner.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this project' });
    }
    
    await Project.findByIdAndDelete(projectId);
    
    // Remove project from user's projects
    const user = await User.findById(req.user.userId);
    user.projects = user.projects.filter(id => id.toString() !== projectId);
    await user.save();
    
    res.json({ message: 'Project deleted successfully' });
    
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add team member to project
router.post('/:projectId/team', authenticateToken, [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required'),
  body('role')
    .optional()
    .isIn(['Lead', 'Developer', 'Designer', 'Tester', 'Documentation'])
    .withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { projectId } = req.params;
    const { userId, role = 'Developer' } = req.body;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user is the owner
    if (project.owner.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to manage team' });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    await project.addTeamMember(userId, role);
    
    const updatedProject = await Project.findById(projectId)
      .populate('owner', 'username firstName lastName avatar')
      .populate('team.user', 'username firstName lastName avatar');
    
    res.json({
      message: 'Team member added successfully',
      project: updatedProject
    });
    
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove team member from project
router.delete('/:projectId/team/:userId', authenticateToken, async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user is the owner
    if (project.owner.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to manage team' });
    }
    
    await project.removeTeamMember(userId);
    
    const updatedProject = await Project.findById(projectId)
      .populate('owner', 'username firstName lastName avatar')
      .populate('team.user', 'username firstName lastName avatar');
    
    res.json({
      message: 'Team member removed successfully',
      project: updatedProject
    });
    
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle like on project
router.post('/:projectId/like', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    await project.toggleLike(req.user.userId);
    
    const updatedProject = await Project.findById(projectId)
      .populate('likes', 'username firstName lastName avatar');
    
    res.json({
      message: 'Like toggled successfully',
      project: updatedProject
    });
    
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update project progress
router.put('/:projectId/progress', authenticateToken, [
  body('progress')
    .isInt({ min: 0, max: 100 })
    .withMessage('Progress must be between 0 and 100'),
  body('status')
    .optional()
    .isIn(['planning', 'in-progress', 'completed', 'on-hold', 'archived'])
    .withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { projectId } = req.params;
    const { progress, status } = req.body;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if user is the owner or team member
    const isOwner = project.owner.toString() === req.user.userId;
    const isTeamMember = project.team.some(member => member.user.toString() === req.user.userId);
    
    if (!isOwner && !isTeamMember) {
      return res.status(403).json({ message: 'Not authorized to update project' });
    }
    
    project.progress = progress;
    if (status) project.status = status;
    
    await project.save();
    
    res.json({
      message: 'Project progress updated successfully',
      project
    });
    
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search projects
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;
    
    const projects = await Project.find({
      $text: { $search: query },
      isPublic: true
    })
    .populate('owner', 'username firstName lastName avatar')
    .populate('team.user', 'username firstName lastName avatar')
    .limit(parseInt(limit));
    
    res.json({ projects });
    
  } catch (error) {
    console.error('Search projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;