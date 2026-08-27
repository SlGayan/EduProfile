import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { verifyToken, requireRole, AuthRequest } from '../middleware/authMiddleware.js';
import { createUserSchema, updateUserSchema } from '../validators/userValidators.js';

const prisma = new PrismaClient();
const router = Router();

router.use(verifyToken);

/**
 * GET /api/users
 * Returns a list of all active (non-deleted) users
 * Excludes passwords from response
 * Accessible to ADMINISTRATOR and PRINCIPAL (read-only for PRINCIPAL)
 */
router.get('/', requireRole(['ADMINISTRATOR', 'PRINCIPAL']), async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        student: true,
        teacher: true,
      },
    });

    return res.status(200).json({ users });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/users
 * Creates a new user
 * Validates input and hashes password
 */
router.post('/', requireRole(['ADMINISTRATOR']), async (req: AuthRequest, res) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const { email, password, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user, along with a Teacher profile if applicable
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          role,
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (role === 'TEACHER') {
        await tx.teacher.create({
          data: { userId: createdUser.id },
        });
      }

      return createdUser;
    });

    return res.status(201).json({ user });
  } catch (err) {
    console.error('Error creating user:', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id
 * Updates an existing user
 * Can update email, password, and/or role
 */
router.put('/:id', requireRole(['ADMINISTRATOR']), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const { email, password, role } = parsed.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser || existingUser.deletedAt) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prepare update data
    const updateData: any = {};

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      // Check if email is already taken by another user
      const emailExists = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (emailExists && emailExists.id !== userId) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      updateData.email = normalizedEmail;
    }

    if (password !== undefined) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    if (role !== undefined) {
      updateData.role = role;
    }

    // Update user, creating a Teacher profile if the role is being changed to TEACHER
    const updatedUser = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (role === 'TEACHER') {
        const existingTeacher = await tx.teacher.findUnique({ where: { userId } });
        if (!existingTeacher) {
          await tx.teacher.create({ data: { userId } });
        }
      }

      return result;
    });

    return res.status(200).json({ user: updatedUser });
  } catch (err) {
    console.error('Error updating user:', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Performs a soft delete by setting deletedAt timestamp
 * Prevents cascading deletion of related data
 */
router.delete('/:id', requireRole(['ADMINISTRATOR']), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser || existingUser.deletedAt) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete user
    const deletedUser = await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
      select: {
        id: true,
        email: true,
        role: true,
        deletedAt: true,
      },
    });

    return res.status(200).json({ message: 'User successfully deactivated', user: deletedUser });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

export default router;
