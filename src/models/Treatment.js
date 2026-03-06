const mongoose = require('mongoose');

const treatmentSchema = new mongoose.Schema({
  treatmentNumber: {
    type: String,
    unique: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client is required']
  },
  petName: {
    type: String,
    trim: true
  },
  treatmentType: {
    type: String,
    enum: ['vaccination', 'deworming', 'treatment'],
    required: [true, 'Treatment type is required']
  },
  description: {
    type: String,
    trim: true
  },
  cost: {
    type: Number,
    required: [true, 'Cost is required'],
    min: 0
  },
  treatmentDate: {
    type: Date,
    required: [true, 'Treatment date is required'],
    default: Date.now
  },
  nextAppointment: {
    type: Date
  },
  veterinarian: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'completed'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Static method to generate treatment number
treatmentSchema.statics.generateTreatmentNumber = async function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const count = await this.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });

  const sequence = (count + 1).toString().padStart(4, '0');
  return `TRT-${year}${month}${day}-${sequence}`;
};

// Ensure virtuals are included
treatmentSchema.set('toJSON', { virtuals: true });
treatmentSchema.set('toObject', { virtuals: true });

// Indexes
treatmentSchema.index({ client: 1 });
treatmentSchema.index({ treatmentType: 1 });
treatmentSchema.index({ treatmentDate: -1 });
treatmentSchema.index({ status: 1 });
treatmentSchema.index({ nextAppointment: 1 });

module.exports = mongoose.model('Treatment', treatmentSchema);
