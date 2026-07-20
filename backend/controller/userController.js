import db from  "../database/db.js";
import crypto from 'crypto';
import path from 'path';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'startuplab-business-ticketing';

export const updateUserAvatar = async (req, res) => {
    try {
        const userId = req.user?.id;
        const file = req.file;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!file) return res.status(400).json({ error: 'Image file is required' });
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Only image uploads are allowed' });
        }

        const ext = path.extname(file.originalname || '') || '.png';
        const fileName = `${userId}/${crypto.randomUUID()}${ext}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await db.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
            });

        if (uploadError) return res.status(500).json({ error: uploadError.message });

        const { data: publicData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        const imageUrl = publicData?.publicUrl;
        if (!imageUrl) return res.status(500).json({ error: 'Failed to generate public URL' });

        let { data, error } = await db
            .from('users')
            .update({ imageUrl })
            .eq('userId', userId)
            .select('userId, name, email, role, imageUrl')
            .maybeSingle();

        if ((!data && !error) || (error && error.message?.includes('column "userId"'))) {
            const resp = await db
                .from('users')
                .update({ imageUrl })
                .eq('id', userId)
                .select('id, name, email, role, imageUrl')
                .maybeSingle();
            data = resp.data; error = resp.error;
        }

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'User not found' });
        return res.json({ imageUrl, user: data, path: filePath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getUser = async (req, res) => {
    try{
        console.log("hi")
    } catch(error){
        console.log(error)
    }
}

export const updateUserName = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { name } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }
        // Try userId column first
        let { data, error } = await db
            .from('users')
            .update({ name })
            .eq('userId', userId)
            .select('userId, name, email, role, imageUrl')
            .maybeSingle();
        // Fallback to id
        if ((!data && !error) || (error && error.message?.includes('column "userId"'))) {
            const resp = await db
                .from('users')
                .update({ name })
                .eq('id', userId)
                .select('id, name, email, role, imageUrl')
                .maybeSingle();
            data = resp.data; error = resp.error;
        }
        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'User not found' });
        return res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const updateUserEmail = async (req, res) => {
  try {
    const userId = req.user?.id;
    const rawEmail = req.body?.email;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const currentEmail = (req.user?.email || '').trim().toLowerCase();
    if (email === currentEmail) {
      const { data, error } = await db
        .from('users')
        .select('userId, name, email, role, imageUrl')
        .eq('userId', userId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'User not found' });
      return res.json(data);
    }

    const { data: existing, error: existingError } = await db
      .from('users')
      .select('userId, email')
      .eq('email', email)
      .maybeSingle();
    if (existingError) return res.status(500).json({ error: existingError.message });
    if (existing?.userId && existing.userId !== userId) {
      return res.status(409).json({ error: 'That email is already in use' });
    }

    const { error: authError } = await db.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (authError) return res.status(500).json({ error: authError.message });

    const { data, error } = await db
      .from('users')
      .update({ email })
      .eq('userId', userId)
      .select('userId, name, email, role, imageUrl')
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getRole = async (req, res) => {
    try {
        // TEMP: fetch the first user's role
        const { data, error } = await db.from("users").select("role").limit(1);
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    } catch(error){
        res.status(500).json({ error: error.message });
    }
}

export const whoAmI = async (req, res) => {
    try{
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        
        // Attempt by userId column first
        let data = null;
        let error = null;
        let resp = await db
            .from('users')
            .select("userId, name, email, role, imageUrl, canviewevents, caneditevents, canmanualcheckin")
            .eq("userId", userId)
            .maybeSingle();
        data = resp.data; error = resp.error;

        // Fallback: some schemas use id instead of userId
        if ((!data && !error) || (error && error.message?.includes('column "userId"') )) {
          resp = await db
            .from('users')
            .select("id, name, email, role, imageUrl, canviewevents, caneditevents, canmanualcheckin")
            .eq("id", userId)
            .maybeSingle();
          data = resp.data; error = resp.error;
        }

        // If permission columns missing, fallback to select minimal with userId
        if (error && error.message?.includes('column')) {
          resp = await db
            .from('users')
            .select("*")
            .eq('userId', userId)
            .maybeSingle();
          data = resp.data; error = resp.error;
        }
        // Fallback with id for minimal select
        if ((!data && !error) || (error && error.message?.includes('column'))) {
          resp = await db
            .from('users')
            .select("*")
            .eq('id', userId)
            .maybeSingle();
          data = resp.data; error = resp.error;
        }

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'User not found' });

        const role = data.role;
        const defaultStaff = role === 'STAFF';
        // Normalize response with permissive defaults for staff unless explicitly false
        return res.json({
          userId: data.userId || data.id,
          name: data.name,
          email: data.email,
          role,
          imageUrl: data.imageUrl,
          canViewEvents: data.canviewevents === undefined || data.canviewevents === null ? defaultStaff : !!data.canviewevents,
          canEditEvents: data.caneditevents === undefined || data.caneditevents === null ? defaultStaff : !!data.caneditevents,
          canManualCheckIn: data.canmanualcheckin === undefined || data.canmanualcheckin === null ? defaultStaff : !!data.canmanualcheckin,
        });

    }catch(error){
        res.status(500).json({ error: error.message });
    }
}

export const getAllUsers = async (req, res) => {
    try {
        let { data, error } = await db.from("users").select("userId, name, email, role, imageUrl, canviewevents, caneditevents, canmanualcheckin");

        if (error && error.message?.includes('column')) {
          const fallback = await db.from("users").select("*");
          data = fallback.data; error = fallback.error;
        }
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data.map(user => ({
          ...user,
          canViewEvents: user.canviewevents,
          canEditEvents: user.caneditevents,
          canManualCheckIn: user.canmanualcheckin,
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updatePermissions = async (req, res) => {
  try {
    let requesterRole = req.user?.role;
    if (requesterRole !== 'ADMIN') {
      // Fallback: look up role in DB using userId/id/email
      const requesterId = req.user?.id;
      const requesterEmail = req.user?.email;
      let roleRow = null;
      if (requesterId) {
        const byUserId = await db.from('users').select('role').eq('userId', requesterId).maybeSingle();
        roleRow = byUserId.data;
        if (!roleRow || byUserId.error) {
          const byId = await db.from('users').select('role').eq('id', requesterId).maybeSingle();
          roleRow = byId.data;
        }
      }
      if (!roleRow && requesterEmail) {
        const byEmail = await db.from('users').select('role').eq('email', requesterEmail).maybeSingle();
        roleRow = byEmail.data;
      }
      requesterRole = roleRow?.role;
    }

    if (requesterRole !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { canViewEvents = false, canEditEvents = false, canManualCheckIn = false } = req.body || {};

    let { data, error } = await db
      .from('users')
      .update({ canviewevents: canViewEvents, caneditevents: canEditEvents, canmanualcheckin: canManualCheckIn })
      .eq('userId', id)
      .select('userId, name, email, role, canviewevents, caneditevents, canmanualcheckin')
      .maybeSingle();

    if ((!data && !error) || (error && error.message?.includes('column "userId"'))) {
      const resp = await db
        .from('users')
        .update({ canviewevents: canViewEvents, caneditevents: canEditEvents, canmanualcheckin: canManualCheckIn })
        .eq('id', id)
        .select('id, name, email, role, canviewevents, caneditevents, canmanualcheckin')
        .maybeSingle();
      data = resp.data; error = resp.error;
    }

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    return res.json({
      ...data,
      canViewEvents: data.canviewevents,
      canEditEvents: data.caneditevents,
      canManualCheckIn: data.canmanualcheckin,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getRoleByEmail = async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: "Email is required" });
        const { data, error } = await db.from("users").select("role").eq("email", email).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: "User not found" });
        return res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

async function requireAdmin(req) {
  let requesterRole = req.user?.role;
  if (requesterRole === 'ADMIN') return true;

  const requesterId = req.user?.id;
  const requesterEmail = req.user?.email;
  let roleRow = null;
  if (requesterId) {
    const byUserId = await db.from('users').select('role').eq('userId', requesterId).maybeSingle();
    roleRow = byUserId.data;
    if (!roleRow || byUserId.error) {
      const byId = await db.from('users').select('role').eq('id', requesterId).maybeSingle();
      roleRow = byId.data;
    }
  }
  if (!roleRow && requesterEmail) {
    const byEmail = await db.from('users').select('role').eq('email', requesterEmail).maybeSingle();
    roleRow = byEmail.data;
  }
  return roleRow?.role === 'ADMIN';
}

async function findUserById(userId) {
  let { data, error } = await db
    .from('users')
    .select('userId, email, name, role')
    .eq('userId', userId)
    .maybeSingle();

  if ((!data && !error) || (error && error.message?.includes('column "userId"'))) {
    const resp = await db
      .from('users')
      .select('id, email, name, role')
      .eq('id', userId)
      .maybeSingle();
    data = resp.data;
    error = resp.error;
  }

  if (error) throw new Error(error.message);
  return data ? { userId: data.userId || data.id, email: data.email, name: data.name, role: data.role } : null;
}

export const sendPasswordReset = async (req, res) => {
  try {
    if (!(await requireAdmin(req))) return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const user = await findUserById(id);
    if (!user?.email) return res.status(404).json({ error: 'User not found' });

    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    if (!frontendUrl) return res.status(500).json({ error: 'FRONTEND_URL is not configured' });

    const { error } = await db.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${frontendUrl}/`,
    });
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'Password reset email sent', email: user.email });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const setUserPassword = async (req, res) => {
  try {
    if (!(await requireAdmin(req))) return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await findUserById(id);
    if (!user?.userId) return res.status(404).json({ error: 'User not found' });

    const { error } = await db.auth.admin.updateUserById(user.userId, { password });
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'Password updated successfully', email: user.email });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const removeStaffUser = async (req, res) => {
  try {
    if (!(await requireAdmin(req))) return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const requesterId = req.user?.id;
    if (requesterId && id === requesterId) {
      return res.status(400).json({ error: 'You cannot remove your own account' });
    }

    const user = await findUserById(id);
    if (!user?.userId) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'STAFF') {
      return res.status(403).json({ error: 'Only STAFF accounts can be removed' });
    }

    let { error: deleteRowError } = await db.from('users').delete().eq('userId', user.userId);
    if (deleteRowError && deleteRowError.message?.includes('column "userId"')) {
      const resp = await db.from('users').delete().eq('id', user.userId);
      deleteRowError = resp.error;
    }
    if (deleteRowError) return res.status(500).json({ error: deleteRowError.message });

    if (user.email) {
      await db.from('invites').delete().eq('email', user.email);
    }

    const { error: authDeleteError } = await db.auth.admin.deleteUser(user.userId);
    if (authDeleteError) {
      return res.status(500).json({
        error: `Removed from team, but failed to delete auth account: ${authDeleteError.message}`,
      });
    }

    return res.json({ message: 'Staff member removed', email: user.email });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};