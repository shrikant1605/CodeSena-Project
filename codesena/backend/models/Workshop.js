const mongoose = require('mongoose');

const workshopSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  shortDescription: {
    type: String,
    maxlength: 300
  },
  category: {
    type: String,
    required: true,
    enum: ['DSA', 'Java Backend', 'MERN Stack', 'DevOps', 'AI/ML', 'Mobile Development', 'Web Development', 'Database', 'System Design', 'Interview Prep', 'Other']
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coInstructors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in hours
    required: true
  },
  maxParticipants: {
    type: Number,
    default: 50
  },
  currentParticipants: {
    type: Number,
    default: 0
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    attendance: {
      type: Boolean,
      default: false
    },
    certificate: {
      issued: {
        type: Boolean,
        default: false
      },
      issuedAt: Date
    }
  }],
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  venue: {
    type: String,
    required: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  meetingLink: {
    type: String
  },
  materials: [{
    title: String,
    description: String,
    url: String,
    type: {
      type: String,
      enum: ['slides', 'video', 'document', 'code', 'assignment']
    }
  }],
  agenda: [{
    time: String,
    topic: String,
    description: String,
    duration: Number // in minutes
  }],
  prerequisites: [{
    type: String,
    trim: true
  }],
  learningOutcomes: [{
    type: String,
    trim: true
  }],
  tools: [{
    name: String,
    description: String,
    setupInstructions: String
  }],
  assignments: [{
    title: String,
    description: String,
    dueDate: Date,
    points: Number,
    submissions: [{
      participant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      submission: String,
      submittedAt: Date,
      score: Number,
      feedback: String
    }]
  }],
  feedback: [{
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  registrationDeadline: {
    type: Date
  },
  cost: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  }
}, {
  timestamps: true
});

// Index for search functionality
workshopSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Virtual for average rating
workshopSchema.virtual('averageRating').get(function() {
  if (this.feedback.length === 0) return 0;
  const totalRating = this.feedback.reduce((sum, feedback) => sum + feedback.rating, 0);
  return (totalRating / this.feedback.length).toFixed(1);
});

// Virtual for availability
workshopSchema.virtual('isAvailable').get(function() {
  return this.currentParticipants < this.maxParticipants && this.status === 'upcoming';
});

// Method to enroll participant
workshopSchema.methods.enrollParticipant = function(userId) {
  if (this.currentParticipants >= this.maxParticipants) {
    throw new Error('Workshop is full');
  }
  
  const existingParticipant = this.participants.find(p => p.user.toString() === userId.toString());
  if (existingParticipant) {
    throw new Error('Already enrolled');
  }
  
  this.participants.push({ user: userId });
  this.currentParticipants += 1;
  return this.save();
};

// Method to unenroll participant
workshopSchema.methods.unenrollParticipant = function(userId) {
  const participantIndex = this.participants.findIndex(p => p.user.toString() === userId.toString());
  if (participantIndex > -1) {
    this.participants.splice(participantIndex, 1);
    this.currentParticipants -= 1;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to mark attendance
workshopSchema.methods.markAttendance = function(userId, attended = true) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  if (participant) {
    participant.attendance = attended;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to add feedback
workshopSchema.methods.addFeedback = function(userId, feedbackData) {
  const existingFeedback = this.feedback.find(f => f.participant.toString() === userId.toString());
  if (existingFeedback) {
    existingFeedback.rating = feedbackData.rating;
    existingFeedback.comment = feedbackData.comment;
  } else {
    this.feedback.push({
      participant: userId,
      rating: feedbackData.rating,
      comment: feedbackData.comment
    });
  }
  return this.save();
};

// Method to submit assignment
workshopSchema.methods.submitAssignment = function(userId, assignmentId, submission) {
  const assignment = this.assignments.id(assignmentId);
  if (assignment) {
    const existingSubmission = assignment.submissions.find(s => s.participant.toString() === userId.toString());
    if (existingSubmission) {
      existingSubmission.submission = submission;
      existingSubmission.submittedAt = new Date();
    } else {
      assignment.submissions.push({
        participant: userId,
        submission,
        submittedAt: new Date()
      });
    }
    return this.save();
  }
  return Promise.resolve(this);
};

module.exports = mongoose.model('Workshop', workshopSchema);