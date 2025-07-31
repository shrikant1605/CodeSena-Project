const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  shortDescription: {
    type: String,
    maxlength: 200
  },
  category: {
    type: String,
    required: true,
    enum: ['Web Development', 'Mobile App', 'AI/ML', 'Data Science', 'DevOps', 'Game Development', 'IoT', 'Blockchain', 'Other']
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    required: true
  },
  technologies: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true
  }],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  team: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['Lead', 'Developer', 'Designer', 'Tester', 'Documentation'],
      default: 'Developer'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['planning', 'in-progress', 'completed', 'on-hold', 'archived'],
    default: 'planning'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  githubUrl: {
    type: String,
    trim: true
  },
  liveUrl: {
    type: String,
    trim: true
  },
  demoUrl: {
    type: String,
    trim: true
  },
  screenshots: [{
    url: String,
    caption: String
  }],
  features: [{
    title: String,
    description: String,
    completed: {
      type: Boolean,
      default: false
    }
  }],
  challenges: [{
    title: String,
    description: String,
    solution: String,
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  views: {
    type: Number,
    default: 0
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  estimatedDuration: {
    type: String,
    enum: ['1-2 weeks', '1 month', '2-3 months', '3+ months']
  },
  learningOutcomes: [{
    type: String,
    trim: true
  }],
  requirements: [{
    type: String,
    trim: true
  }],
  resources: [{
    title: String,
    url: String,
    type: {
      type: String,
      enum: ['documentation', 'tutorial', 'video', 'article', 'other']
    }
  }]
}, {
  timestamps: true
});

// Index for search functionality
projectSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Virtual for like count
projectSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Method to add team member
projectSchema.methods.addTeamMember = function(userId, role = 'Developer') {
  const existingMember = this.team.find(member => member.user.toString() === userId.toString());
  if (!existingMember) {
    this.team.push({ user: userId, role });
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove team member
projectSchema.methods.removeTeamMember = function(userId) {
  this.team = this.team.filter(member => member.user.toString() !== userId.toString());
  return this.save();
};

// Method to toggle like
projectSchema.methods.toggleLike = function(userId) {
  const likeIndex = this.likes.indexOf(userId);
  if (likeIndex > -1) {
    this.likes.splice(likeIndex, 1);
  } else {
    this.likes.push(userId);
  }
  return this.save();
};

// Method to increment views
projectSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

module.exports = mongoose.model('Project', projectSchema);