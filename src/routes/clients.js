const express = require('express');
const { body } = require('express-validator');
const {
  getAllClients,
  getClient,
  createClient,
  updateClient,
  addPet,
  removePet,
  deactivateClient,
  reactivateClient,
  searchClients
} = require('../controllers/clientController');
const { protect } = require('../middleware/auth');
const { authorizeMinRole } = require('../middleware/roleCheck');

const router = express.Router();

// Validation rules
const createClientValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('pets').optional().isArray().withMessage('Pets must be an array'),
  body('pets.*.name').optional().trim().notEmpty().withMessage('Pet name is required')
];

const updateClientValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('pets').optional().isArray().withMessage('Pets must be an array')
];

const addPetValidation = [
  body('name').trim().notEmpty().withMessage('Pet name is required'),
  body('type').optional().trim(),
  body('breed').optional().trim(),
  body('age').optional().trim()
];

// Apply auth middleware to all routes
router.use(protect);
router.use(authorizeMinRole('admin'));

// Search route (must be before /:id)
router.get('/search', searchClients);

// CRUD routes
router.get('/', getAllClients);
router.post('/', createClientValidation, createClient);
router.get('/:id', getClient);
router.put('/:id', updateClientValidation, updateClient);
router.delete('/:id', deactivateClient);
router.put('/:id/reactivate', reactivateClient);

// Pet management routes
router.post('/:id/pets', addPetValidation, addPet);
router.delete('/:id/pets/:petId', removePet);

module.exports = router;
