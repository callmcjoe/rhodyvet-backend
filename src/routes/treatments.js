const express = require('express');
const { body } = require('express-validator');
const {
  getAllTreatments,
  getTreatment,
  createTreatment,
  updateTreatment,
  getClientTreatments,
  getTreatmentStats,
  getUpcomingAppointments,
  cancelTreatment
} = require('../controllers/treatmentController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

const router = express.Router();

// Validation rules
const createTreatmentValidation = [
  body('client').isMongoId().withMessage('Valid client ID is required'),
  body('treatmentType')
    .isIn(['vaccination', 'deworming', 'treatment'])
    .withMessage('Treatment type must be vaccination, deworming, or treatment'),
  body('cost').isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  body('treatmentDate').optional().isISO8601().withMessage('Invalid treatment date'),
  body('nextAppointment').optional().isISO8601().withMessage('Invalid next appointment date'),
  body('petName').optional().trim(),
  body('description').optional().trim(),
  body('veterinarian').optional().trim(),
  body('notes').optional().trim(),
  body('status').optional().isIn(['scheduled', 'completed', 'cancelled']).withMessage('Invalid status')
];

const updateTreatmentValidation = [
  body('treatmentType')
    .optional()
    .isIn(['vaccination', 'deworming', 'treatment'])
    .withMessage('Treatment type must be vaccination, deworming, or treatment'),
  body('cost').optional().isFloat({ min: 0 }).withMessage('Cost must be a positive number'),
  body('treatmentDate').optional().isISO8601().withMessage('Invalid treatment date'),
  body('nextAppointment').optional().isISO8601().withMessage('Invalid next appointment date'),
  body('petName').optional().trim(),
  body('description').optional().trim(),
  body('veterinarian').optional().trim(),
  body('notes').optional().trim(),
  body('status').optional().isIn(['scheduled', 'completed', 'cancelled']).withMessage('Invalid status')
];

// Apply auth middleware to all routes
router.use(protect);
router.use(authorizeMinRole('admin'));

// Stats and special routes (must be before /:id)
router.get('/stats', getTreatmentStats);
router.get('/upcoming', getUpcomingAppointments);
router.get('/client/:clientId', getClientTreatments);

// CRUD routes
router.get('/', getAllTreatments);
router.post('/', createTreatmentValidation, createTreatment);
router.get('/:id', getTreatment);
router.put('/:id', updateTreatmentValidation, updateTreatment);
router.put('/:id/cancel', cancelTreatment);

module.exports = router;
