import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import User from './models/User';

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in .env');
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const username = process.env.ADMIN_USERNAME || 'admin';
    const name = process.env.ADMIN_NAME || 'Admin User';

    if (!email || !password) {
      throw new Error(
        'ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to seed an admin user.\n' +
        'Example:\n  ADMIN_EMAIL=admin@example.com\n  ADMIN_PASSWORD=YourStrongPassword123!'
      );
    }

    if (password.length < 8) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // Check if user already exists
    let adminUser = await User.findOne({ email });

    if (adminUser) {
      console.log('Admin user already exists. Updating role and password...');
      adminUser.role = 'admin';
      adminUser.password = await bcrypt.hash(password, 12);
      await adminUser.save();
      console.log('Admin user updated successfully.');
    } else {
      console.log('Creating new admin user...');
      const hashedPassword = await bcrypt.hash(password, 12);
      adminUser = await User.create({
        name,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'admin',
        avatarColor: '#FFD600',
      });
      console.log('Admin user created successfully.');
    }

    console.log('\n=== Admin Seeded ===');
    console.log(`Email: ${email}`);
    console.log(`Username: ${username}`);
    console.log('Role: admin');
    console.log('===================\n');

  } catch (error) {
    console.error('Error seeding admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

seedAdmin();
