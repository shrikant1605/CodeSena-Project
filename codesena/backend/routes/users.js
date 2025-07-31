const express = require('express');
const User = require('../models/User');
const Project = require('../models/Project');
const Mentorship = require('../models/Mentorship');

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

// Get all users (with pagination and filters)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, level, role, skills } = req.query;
    
    const query = { isActive: true };
    
    // Search functionality
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by level
    if (level) {
      query.level = level;
    }
    
    // Filter by role
    if (role) {
      query.role = role;
    }
    
    // Filter by skills
    if (skills) {
      const skillsArray = skills.split(',').map(skill => skill.trim());
      query.skills = { $in: skillsArray };
    }
    
    const skip = (page - 1) * limit;
    
    const users = await User.find(query)
      .select('-password')
      .sort({ points: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        hasNext: skip + users.length < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user by ID
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-password')
      .populate('projects', 'title description category status progress')
      .populate('workshops', 'title description category status');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's mentorship questions
    const questions = await Mentorship.find({ asker: userId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get user's mentorship answers
    const answers = await Mentorship.find({ 'answers.mentor': userId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      user,
      questions,
      answers
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user avatar
router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    
    if (!avatar) {
      return res.status(400).json({ message: 'Avatar URL is required' });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.avatar = avatar;
    await user.save();
    
    res.json({
      message: 'Avatar updated successfully',
      avatar: user.avatar
    });
    
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's projects
router.get('/:userId/projects', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const projects = await Project.find({ owner: userId })
      .populate('owner', 'username firstName lastName avatar')
      .populate('team.user', 'username firstName lastName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Project.countDocuments({ owner: userId });
    
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
    console.error('Get user projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's mentorship activity
router.get('/:userId/mentorship', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const questions = await Mentorship.find({ asker: userId })
      .sort({ createdAt: -1 });
    
    const answers = await Mentorship.find({ 'answers.mentor': userId })
      .sort({ createdAt: -1 });
    
    const totalPoints = answers.reduce((sum, mentorship) => {
      return sum + mentorship.answers
        .filter(answer => answer.mentor.toString() === userId)
        .reduce((answerSum, answer) => answerSum + (answer.pointsAwarded || 0), 0);
    }, 0);
    
    res.json({
      questions,
      answers,
      totalPoints
    });
    
  } catch (error) {
    console.error('Get user mentorship error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Follow/Unfollow user
router.post('/:userId/follow', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.userId === userId) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }
    
    // Simple follow system - you can extend this with a separate Follow model
    const isFollowing = currentUser.following && currentUser.following.includes(userId);
    
    if (isFollowing) {
      // Unfollow
      currentUser.following = currentUser.following.filter(id => id.toString() !== userId);
      userToFollow.followers = userToFollow.followers.filter(id => id.toString() !== req.user.userId);
    } else {
      // Follow
      if (!currentUser.following) currentUser.following = [];
      if (!userToFollow.followers) userToFollow.followers = [];
      
      currentUser.following.push(userId);
      userToFollow.followers.push(req.user.userId);
    }
    
    await currentUser.save();
    await userToFollow.save();
    
    res.json({
      message: isFollowing ? 'Unfollowed successfully' : 'Followed successfully',
      isFollowing: !isFollowing
    });
    
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's badges and achievements
router.get('/:userId/badges', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('badges points rank');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      badges: user.badges,
      points: user.points,
      rank: user.rank
    });
    
  } catch (error) {
    console.error('Get user badges error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;
    
    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { skills: { $in: [new RegExp(query, 'i')] } }
      ],
      isActive: true
    })
    .select('-password')
    .limit(parseInt(limit));
    
    res.json({ users });
    
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;