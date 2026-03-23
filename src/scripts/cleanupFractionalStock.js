/**
 * Cleanup Script: Fix fractional paint values
 *
 * This script finds all products with fractional stockInPaints values
 * (legacy from the old 1/3 bag system) and rounds them to whole numbers.
 *
 * Run with: node src/scripts/cleanupFractionalStock.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGODB_URI not found in environment variables');
  console.error('Please ensure .env file exists with MONGODB_URI defined');
  process.exit(1);
}

const Product = require('../models/Product');

const cleanupFractionalStock = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Find all products with fractional stockInPaints
    const products = await Product.find({});

    let updatedCount = 0;
    const changes = [];

    for (const product of products) {
      const currentStock = product.stockInPaints;

      // Check if it has a fractional part
      if (currentStock !== Math.round(currentStock)) {
        const roundedStock = Math.round(currentStock);
        const difference = roundedStock - currentStock;

        changes.push({
          name: product.name,
          department: product.department,
          before: currentStock,
          after: roundedStock,
          difference: difference.toFixed(4)
        });

        // Update the product
        product.stockInPaints = roundedStock;
        await product.save();
        updatedCount++;
      }
    }

    // Print results
    console.log('=== CLEANUP RESULTS ===\n');

    if (changes.length === 0) {
      console.log('No products with fractional stock values found. Database is clean!');
    } else {
      console.log(`Found and fixed ${updatedCount} product(s) with fractional stock:\n`);

      changes.forEach((change, index) => {
        console.log(`${index + 1}. ${change.name} (${change.department})`);
        console.log(`   Before: ${change.before} paints`);
        console.log(`   After:  ${change.after} paints`);
        console.log(`   Adjustment: ${change.difference > 0 ? '+' : ''}${change.difference} paints\n`);
      });

      console.log('=== SUMMARY ===');
      console.log(`Total products scanned: ${products.length}`);
      console.log(`Products updated: ${updatedCount}`);
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('Error running cleanup script:', error);
    process.exit(1);
  }
};

// Run the script
cleanupFractionalStock();
