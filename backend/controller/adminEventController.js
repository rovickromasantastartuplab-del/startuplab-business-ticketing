import supabase from '../database/db.js';
import crypto from 'crypto';
import path from 'path';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'startuplab-business-ticketing';

function slugify(text = '') {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Keys that always exist as fixed fields (name/email) or are legacy fixed columns
// (phone/company) — a custom field's key can never collide with these.
const RESERVED_FIELD_KEYS = ['name', 'email', 'phone', 'company'];

// Returns an error string, or null if the formFields payload is valid.
// Accepts undefined/null (no-op — legacy behavior) and an empty array.
function validateFormFields(formFields) {
  if (formFields === undefined || formFields === null) return null;
  if (!Array.isArray(formFields)) return 'formFields must be an array';

  const seenKeys = new Set();
  for (const field of formFields) {
    if (!field || typeof field !== 'object') return 'Each form field must be an object';
    const { key, label, type, required } = field;
    if (!key || typeof key !== 'string') return 'Each form field requires a string key';
    if (!label || typeof label !== 'string') return 'Each form field requires a string label';
    if (!['text', 'email', 'phone', 'select', 'checkbox'].includes(type)) {
      return `Invalid field type "${type}" for field "${label}"`;
    }
    if (typeof required !== 'boolean') return `Field "${label}" must specify required as true/false`;
    if (RESERVED_FIELD_KEYS.includes(key)) {
      return `Field key "${key}" collides with a fixed field (name, email, phone, company)`;
    }
    if (seenKeys.has(key)) return `Duplicate field key "${key}"`;
    seenKeys.add(key);
  }
  return null;
}

export const listAdminEvents = async (req, res) => {
  try {
    const search = (req.query?.search || '').toString().trim();
    let query = supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`eventName.ilike.%${search}%,locationText.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const uploadEventImage = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Image file is required' });
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' });
    }

    const ext = path.extname(file.originalname || '') || '.png';
    const fileName = `${crypto.randomUUID()}${ext}`;
    const filePath = `images/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const publicUrl = publicData?.publicUrl;
    if (!publicUrl) return res.status(500).json({ error: 'Failed to generate public URL' });

    const eventId = req.body?.eventId;
    let event = null;
    if (eventId) {
      const { data, error } = await supabase
        .from('events')
        .update({ imageUrl: publicUrl, updated_at: new Date().toISOString() })
        .eq('eventId', eventId)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      event = data;
    }

    return res.json({ publicUrl, path: filePath, event });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Image upload failed' });
  }
};

export const getAdminEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('eventId', id)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Event not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const createEvent = async (req, res) => {
  try {
    const {
      eventName,
      slug,
      description,
      startAt,
      endAt,
      timezone,
      locationType,
      locationText,
      capacityTotal,
      regOpenAt,
      regCloseAt,
      status = 'DRAFT',
      imageUrl,
      streamingPlatform,
      formFields,
      createdBy: createdByFromBody
    } = req.body || {};

    if (!eventName) return res.status(400).json({ error: 'eventName is required' });

    const formFieldsError = validateFormFields(formFields);
    if (formFieldsError) return res.status(400).json({ error: formFieldsError });

    const payload = {
      eventName,
      slug: slug && slug.length ? slug : slugify(eventName),
      description: description || null,
      startAt: startAt || null,
      endAt: endAt || null,
      timezone: timezone || null,
      locationType: locationType || null,
      locationText: locationText || null,
      capacityTotal: Number.isFinite(Number(capacityTotal)) ? Number(capacityTotal) : null,
      regOpenAt: regOpenAt || null,
      regCloseAt: regCloseAt || null,
      status,
      imageUrl: imageUrl || null,
      streamingPlatform: streamingPlatform || null,
      formFields: formFields ?? null,
      createdBy: req.user?.id || createdByFromBody || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('events')
      .insert(payload)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.formFields !== undefined) {
      const formFieldsError = validateFormFields(updates.formFields);
      if (formFieldsError) return res.status(400).json({ error: formFieldsError });
    }

    if (updates.capacityTotal !== undefined) {
      updates.capacityTotal = Number.isFinite(Number(updates.capacityTotal))
        ? Number(updates.capacityTotal)
        : null;
    }
    if (updates.eventName && !updates.slug) {
      updates.slug = slugify(updates.eventName);
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('eventId', id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Event not found' });

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('eventId', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const publishEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('events')
      .update({ status: 'PUBLISHED', updated_at: new Date().toISOString() })
      .eq('eventId', id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Event not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

export const closeEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('events')
      .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('eventId', id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Event not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};
