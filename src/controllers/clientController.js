const { validationResult } = require('express-validator');
const Client = require('../models/Client');
const Treatment = require('../models/Treatment');

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private (Admin/Super Admin)
const getAllClients = async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 50 } = req.query;

    const query = {};

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search by name or phone
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [clients, total] = await Promise.all([
      Client.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Client.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: clients.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: clients
    });
  } catch (error) {
    console.error('Get all clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single client
// @route   GET /api/clients/:id
// @access  Private (Admin/Super Admin)
const getClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get client's treatment history
    const treatments = await Treatment.find({ client: client._id })
      .sort({ treatmentDate: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        ...client.toObject(),
        recentTreatments: treatments
      }
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new client
// @route   POST /api/clients
// @access  Private (Admin/Super Admin)
const createClient = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { firstName, lastName, phone, email, address, pets } = req.body;

    // Check if client with same phone exists
    const existingClient = await Client.findOne({ phone });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'A client with this phone number already exists'
      });
    }

    // Generate client number
    const clientNumber = await Client.generateClientNumber();

    const client = await Client.create({
      clientNumber,
      firstName,
      lastName,
      phone,
      email,
      address,
      pets: pets || [],
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update client
// @route   PUT /api/clients/:id
// @access  Private (Admin/Super Admin)
const updateClient = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const { firstName, lastName, phone, email, address, pets } = req.body;

    // Check if phone is being changed and if it conflicts with another client
    if (phone && phone !== client.phone) {
      const existingClient = await Client.findOne({ phone, _id: { $ne: client._id } });
      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'A client with this phone number already exists'
        });
      }
    }

    // Update fields
    if (firstName) client.firstName = firstName;
    if (lastName) client.lastName = lastName;
    if (phone) client.phone = phone;
    if (email !== undefined) client.email = email;
    if (address !== undefined) client.address = address;
    if (pets !== undefined) client.pets = pets;

    await client.save();

    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Add pet to client
// @route   POST /api/clients/:id/pets
// @access  Private (Admin/Super Admin)
const addPet = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const { name, type, breed, age, notes } = req.body;

    client.pets.push({ name, type, breed, age, notes });
    await client.save();

    res.json({
      success: true,
      message: 'Pet added successfully',
      data: client
    });
  } catch (error) {
    console.error('Add pet error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Remove pet from client
// @route   DELETE /api/clients/:id/pets/:petId
// @access  Private (Admin/Super Admin)
const removePet = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const petIndex = client.pets.findIndex(p => p._id.toString() === req.params.petId);
    if (petIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Pet not found'
      });
    }

    client.pets.splice(petIndex, 1);
    await client.save();

    res.json({
      success: true,
      message: 'Pet removed successfully',
      data: client
    });
  } catch (error) {
    console.error('Remove pet error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Deactivate client
// @route   DELETE /api/clients/:id
// @access  Private (Admin/Super Admin)
const deactivateClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    client.isActive = false;
    await client.save();

    res.json({
      success: true,
      message: 'Client deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Reactivate client
// @route   PUT /api/clients/:id/reactivate
// @access  Private (Admin/Super Admin)
const reactivateClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    client.isActive = true;
    await client.save();

    res.json({
      success: true,
      message: 'Client reactivated successfully',
      data: client
    });
  } catch (error) {
    console.error('Reactivate client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Search clients (for autocomplete)
// @route   GET /api/clients/search
// @access  Private (Admin/Super Admin)
const searchClients = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const clients = await Client.find({
      isActive: true,
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ]
    })
      .select('firstName lastName phone pets clientNumber')
      .limit(10);

    res.json({
      success: true,
      data: clients
    });
  } catch (error) {
    console.error('Search clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllClients,
  getClient,
  createClient,
  updateClient,
  addPet,
  removePet,
  deactivateClient,
  reactivateClient,
  searchClients
};
