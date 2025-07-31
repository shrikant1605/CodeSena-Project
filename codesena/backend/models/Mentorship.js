const mongoose = require('mongoose');

const mentorshipSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    maxlength: 1000
  },
  description: {
    type: String,
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    enum: ['DSA', 'Java Backend', 'MERN Stack', 'DevOps', 'AI/ML', 'Mobile Development', 'Web Development', 'Database', 'System Design', 'Other']
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  asker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  answers: [{
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answer: {
      type: String,
      required: true,
      maxlength: 5000
    },
    codeSnippet: {
      type: String,
      maxlength: 2000
    },
    resources: [{
      title: String,
      url: String,
      type: {
        type: String,
        enum: ['documentation', 'tutorial', 'video', 'article', 'github']
      }
    }],
    isAccepted: {
      type: Boolean,
      default: false
    },
    pointsAwarded: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['open', 'answered', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  views: {
    type: Number,
    default: 0
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: {
    type: Date
  },
  acceptedAnswer: {
    type: mongoose.Schema.Types.ObjectId
  },
  sessionRequests: [{
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    proposedTime: {
      type: Date
    },
    duration: {
      type: Number, // in minutes
      default: 30
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'completed', 'cancelled'],
      default: 'pending'
    },
    notes: {
      type: String,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    url: String,
    type: String
  }]
}, {
  timestamps: true
});

// Index for search functionality
mentorshipSchema.index({ question: 'text', description: 'text', tags: 'text' });

// Virtual for vote count
mentorshipSchema.virtual('voteCount').get(function() {
  return this.upvotes.length - this.downvotes.length;
});

// Virtual for answer count
mentorshipSchema.virtual('answerCount').get(function() {
  return this.answers.length;
});

// Method to add answer
mentorshipSchema.methods.addAnswer = function(mentorId, answerData) {
  const answer = {
    mentor: mentorId,
    answer: answerData.answer,
    codeSnippet: answerData.codeSnippet || '',
    resources: answerData.resources || []
  };
  
  this.answers.push(answer);
  this.status = 'answered';
  return this.save();
};

// Method to accept answer
mentorshipSchema.methods.acceptAnswer = function(answerId) {
  const answer = this.answers.id(answerId);
  if (answer) {
    answer.isAccepted = true;
    this.isResolved = true;
    this.resolvedAt = new Date();
    this.status = 'resolved';
    this.acceptedAnswer = answerId;
    
    // Award points based on difficulty
    let points = 0;
    if (this.difficulty === 'beginner') points = 5;
    else if (this.difficulty === 'intermediate') points = 10;
    else if (this.difficulty === 'advanced') points = 15;
    
    answer.pointsAwarded = points;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to toggle upvote
mentorshipSchema.methods.toggleUpvote = function(userId) {
  const upvoteIndex = this.upvotes.indexOf(userId);
  const downvoteIndex = this.downvotes.indexOf(userId);
  
  if (upvoteIndex > -1) {
    this.upvotes.splice(upvoteIndex, 1);
  } else {
    this.upvotes.push(userId);
    if (downvoteIndex > -1) {
      this.downvotes.splice(downvoteIndex, 1);
    }
  }
  return this.save();
};

// Method to toggle downvote
mentorshipSchema.methods.toggleDownvote = function(userId) {
  const downvoteIndex = this.downvotes.indexOf(userId);
  const upvoteIndex = this.upvotes.indexOf(userId);
  
  if (downvoteIndex > -1) {
    this.downvotes.splice(downvoteIndex, 1);
  } else {
    this.downvotes.push(userId);
    if (upvoteIndex > -1) {
      this.upvotes.splice(upvoteIndex, 1);
    }
  }
  return this.save();
};

// Method to increment views
mentorshipSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Method to request session
mentorshipSchema.methods.requestSession = function(requesterId, mentorId, sessionData) {
  const sessionRequest = {
    requester: requesterId,
    mentor: mentorId,
    proposedTime: sessionData.proposedTime,
    duration: sessionData.duration || 30,
    notes: sessionData.notes || ''
  };
  
  this.sessionRequests.push(sessionRequest);
  return this.save();
};

module.exports = mongoose.model('Mentorship', mentorshipSchema);