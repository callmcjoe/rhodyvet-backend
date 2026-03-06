const { validationResult } = require('express-validator');
const Treatment = require('../models/Treatment');
const Client = require('../models/Client');

// @desc    Get all treatments
// @route   GET /api/treatments
// @access  Private (Admin/Super Admin)
const getAllTreatments = async (req, res) => {
  try {
    const {
      treatmentType,
      status,
      clientId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};

    // Filter by treatment type
    if (treatmentType) {
      query.treatmentType = treatmentType;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by client
    if (clientId) {
      query.client = clientId;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.treatmentDate = {};
      if (startDate) query.treatmentDate.$gte = new Date(startDate);
      if (endDate) query.treatmentDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let treatments = Treatment.find(query)
      .populate('client', 'firstName lastName phone clientNumber pets')
      .populate('createdBy', 'firstName lastName')
      .sort({ treatmentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const [results, total] = await Promise.all([
      treatments,
      Treatment.countDocuments(query)
    ]);

    // If search is provided, filter by client name
    let filteredResults = results;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredResults = results.filter(t =>
        t.client?.firstName?.toLowerCase().includes(searchLower) ||
        t.client?.lastName?.toLowerCase().includes(searchLower) ||
        t.client?.phone?.includes(search) ||
        t.petName?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      count: filteredResults.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: filteredResults
    });
  } catch (error) {
    console.error('Get all treatments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single treatment
// @route   GET /api/treatments/:id
// @access  Private (Admin/Super Admin)
const getTreatment = async (req, res) => {
  try {
    const treatment = await Treatment.findById(req.params.id)
      .populate('client', 'firstName lastName phone email address clientNumber pets')
      .populate('createdBy', 'firstName lastName');

    if (!treatment) {
      return res.status(404).json({
        success: false,
        message: 'Treatment not found'
      });
    }

    res.json({
      success: true,
      data: treatment
    });
  } catch (error) {
    console.error('Get treatment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create new treatment
// @route   POST /api/treatments
// @access  Private (Admin/Super Admin)
const createTreatment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      client,
      petName,
      treatmentType,
      description,
      cost,
      treatmentDate,
      nextAppointment,
      veterinarian,
      notes,
      status
    } = req.body;

    // Verify client exists
    const clientDoc = await Client.findById(client);
    if (!clientDoc) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Generate treatment number
    const treatmentNumber = await Treatment.generateTreatmentNumber();

    const treatment = await Treatment.create({
      treatmentNumber,
      client,
      petName,
      treatmentType,
      description,
      cost,
      treatmentDate: treatmentDate || new Date(),
      nextAppointment,
      veterinarian,
      notes,
      status: status || 'completed',
      createdBy: req.user.id
    });

    // Populate client info for response
    await treatment.populate('client', 'firstName lastName phone clientNumber');

    res.status(201).json({
      success: true,
      data: treatment
    });
  } catch (error) {
    console.error('Create treatment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update treatment
// @route   PUT /api/treatments/:id
// @access  Private (Admin/Super Admin)
const updateTreatment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const treatment = await Treatment.findById(req.params.id);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        message: 'Treatment not found'
      });
    }

    const {
      petName,
      treatmentType,
      description,
      cost,
      treatmentDate,
      nextAppointment,
      veterinarian,
      notes,
      status
    } = req.body;

    // Update fields
    if (petName !== undefined) treatment.petName = petName;
    if (treatmentType) treatment.treatmentType = treatmentType;
    if (description !== undefined) treatment.description = description;
    if (cost !== undefined) treatment.cost = cost;
    if (treatmentDate) treatment.treatmentDate = treatmentDate;
    if (nextAppointment !== undefined) treatment.nextAppointment = nextAppointment;
    if (veterinarian !== undefined) treatment.veterinarian = veterinarian;
    if (notes !== undefined) treatment.notes = notes;
    if (status) treatment.status = status;

    await treatment.save();

    await treatment.populate('client', 'firstName lastName phone clientNumber');

    res.json({
      success: true,
      data: treatment
    });
  } catch (error) {
    console.error('Update treatment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get treatments by client
// @route   GET /api/treatments/client/:clientId
// @access  Private (Admin/Super Admin)
const getClientTreatments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Verify client exists
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [treatments, total] = await Promise.all([
      Treatment.find({ client: req.params.clientId })
        .populate('createdBy', 'firstName lastName')
        .sort({ treatmentDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Treatment.countDocuments({ client: req.params.clientId })
    ]);

    res.json({
      success: true,
      count: treatments.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      client: {
        _id: client._id,
        fullName: client.fullName,
        phone: client.phone
      },
      data: treatments
    });
  } catch (error) {
    console.error('Get client treatments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get treatment statistics
// @route   GET /api/treatments/stats
// @access  Private (Admin/Super Admin)
const getTreatmentStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Get counts by type
    const [
      totalVaccinations,
      totalDewormings,
      totalTreatments,
      todaysTreatments,
      upcomingAppointments,
      totalRevenue,
      todayRevenue
    ] = await Promise.all([
      Treatment.countDocuments({ treatmentType: 'vaccination' }),
      Treatment.countDocuments({ treatmentType: 'deworming' }),
      Treatment.countDocuments({ treatmentType: 'treatment' }),
      Treatment.countDocuments({
        treatmentDate: { $gte: startOfDay, $lte: endOfDay }
      }),
      Treatment.countDocuments({
        nextAppointment: { $gte: startOfDay },
        status: { $ne: 'cancelled' }
      }),
      Treatment.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$cost' } } }
      ]),
      Treatment.aggregate([
        {
          $match: {
            treatmentDate: { $gte: startOfDay, $lte: endOfDay },
            status: { $ne: 'cancelled' }
          }
        },
        { $group: { _id: null, total: { $sum: '$cost' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalVaccinations,
        totalDewormings,
        totalTreatments,
        todaysTreatments,
        upcomingAppointments,
        totalRevenue: totalRevenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get treatment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get upcoming appointments
// @route   GET /api/treatments/upcoming
// @access  Private (Admin/Super Admin)
const getUpcomingAppointments = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));
    futureDate.setHours(23, 59, 59, 999);

    const appointments = await Treatment.find({
      nextAppointment: { $gte: today, $lte: futureDate },
      status: { $ne: 'cancelled' }
    })
      .populate('client', 'firstName lastName phone')
      .sort({ nextAppointment: 1 })
      .limit(50);

    res.json({
      success: true,
      count: appointments.length,
      data: appointments
    });
  } catch (error) {
    console.error('Get upcoming appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Cancel treatment
// @route   PUT /api/treatments/:id/cancel
// @access  Private (Admin/Super Admin)
const cancelTreatment = async (req, res) => {
  try {
    const treatment = await Treatment.findById(req.params.id);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        message: 'Treatment not found'
      });
    }

    if (treatment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Treatment is already cancelled'
      });
    }

    treatment.status = 'cancelled';
    await treatment.save();

    res.json({
      success: true,
      message: 'Treatment cancelled successfully',
      data: treatment
    });
  } catch (error) {
    console.error('Cancel treatment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getAllTreatments,
  getTreatment,
  createTreatment,
  updateTreatment,
  getClientTreatments,
  getTreatmentStats,
  getUpcomingAppointments,
  cancelTreatment
};
