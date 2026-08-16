import supabase from '../database/db.js';

const VALID_TYPES = ['CUSTOM', 'SOCIAL'];
const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'LINKEDIN', 'YOUTUBE'];

function validateLinkPayload({ type, label, platform, url, columnId }) {
  if (!VALID_TYPES.includes(type)) return 'type must be CUSTOM or SOCIAL';
  if (!url || !url.toString().trim()) return 'url is required';
  if (type === 'CUSTOM') {
    if (!label?.toString().trim()) return 'label is required for custom links';
    if (!columnId) return 'columnId is required for custom links';
  }
  if (type === 'SOCIAL' && !VALID_PLATFORMS.includes(platform)) return `platform must be one of ${VALID_PLATFORMS.join(', ')}`;
  return null;
}

// ============================================================================
// Columns
// ============================================================================

// GET /api/footer-columns (public)
export const listFooterColumns = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('footerColumns')
      .select('*')
      .order('sortOrder', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// GET /api/admin/footer-columns
export const listAdminFooterColumns = listFooterColumns;

// POST /api/admin/footer-columns
export const createFooterColumn = async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title?.toString().trim()) return res.status(400).json({ error: 'title is required' });

    const { data: maxRow } = await supabase
      .from('footerColumns')
      .select('sortOrder')
      .order('sortOrder', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (maxRow?.sortOrder ?? -1) + 1;

    const { data, error } = await supabase
      .from('footerColumns')
      .insert({ title: title.toString().trim(), sortOrder: nextSortOrder })
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// PUT /api/admin/footer-columns/:id
export const updateFooterColumn = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body || {};
    if (!title?.toString().trim()) return res.status(400).json({ error: 'title is required' });

    const { data, error } = await supabase
      .from('footerColumns')
      .update({ title: title.toString().trim(), updated_at: new Date().toISOString() })
      .eq('footerColumnId', id)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Footer column not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// DELETE /api/admin/footer-columns/:id (cascades to its links via FK)
export const deleteFooterColumn = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('footerColumns').delete().eq('footerColumnId', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Footer column deleted' });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// ============================================================================
// Links
// ============================================================================

// GET /api/footer-links (public)
export const listFooterLinks = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('footerLinks')
      .select('*')
      .order('sortOrder', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// GET /api/admin/footer-links
export const listAdminFooterLinks = listFooterLinks;

// POST /api/admin/footer-links
export const createFooterLink = async (req, res) => {
  try {
    const { type, label, platform, url, columnId } = req.body || {};
    const validationError = validateLinkPayload({ type, label, platform, url, columnId });
    if (validationError) return res.status(400).json({ error: validationError });

    const { data: maxRow } = await supabase
      .from('footerLinks')
      .select('sortOrder')
      .order('sortOrder', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (maxRow?.sortOrder ?? -1) + 1;

    const { data, error } = await supabase
      .from('footerLinks')
      .insert({
        type,
        label: type === 'CUSTOM' ? label.toString().trim() : (label?.toString().trim() || null),
        platform: type === 'SOCIAL' ? platform : null,
        columnId: type === 'CUSTOM' ? columnId : null,
        url: url.toString().trim(),
        sortOrder: nextSortOrder,
      })
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// PUT /api/admin/footer-links/:id
export const updateFooterLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, label, platform, url, columnId } = req.body || {};
    const validationError = validateLinkPayload({ type, label, platform, url, columnId });
    if (validationError) return res.status(400).json({ error: validationError });

    const { data, error } = await supabase
      .from('footerLinks')
      .update({
        type,
        label: type === 'CUSTOM' ? label.toString().trim() : (label?.toString().trim() || null),
        platform: type === 'SOCIAL' ? platform : null,
        columnId: type === 'CUSTOM' ? columnId : null,
        url: url.toString().trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('footerLinkId', id)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Footer link not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// DELETE /api/admin/footer-links/:id
export const deleteFooterLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('footerLinks').delete().eq('footerLinkId', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Footer link deleted' });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};

// PUT /api/admin/footer-links/reorder
export const reorderFooterLinks = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });

    await Promise.all(ids.map((id, index) =>
      supabase.from('footerLinks').update({ sortOrder: index }).eq('footerLinkId', id)
    ));

    return res.json({ message: 'Footer links reordered' });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
};
