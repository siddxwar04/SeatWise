import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { ApiError, menuApi } from '../lib/api.js';

/**
 * Admin menu CRUD — Phase 5. The public menu already reads from the DB;
 * this is how staff add, price-edit, 86, or remove dishes without redeploying.
 */

const EMPTY = {
  slug: '',
  name: '',
  description: '',
  price: '',
  category: 'LUNCH',
  imageUrl: '/images/menu-grill.webp',
  imageAlt: '',
  allergens: [],
  dietaryTags: [],
  sortOrder: 0,
};

const ALLERGENS = [
  'GLUTEN',
  'DAIRY',
  'EGG',
  'PEANUT',
  'TREE_NUT',
  'SOY',
  'FISH',
  'SHELLFISH',
  'SESAME',
];

const DIETARY_TAGS = [
  'VEGETARIAN',
  'VEGAN',
  'JAIN',
  'HALAL',
  'CONTAINS_EGG',
  'NON_VEGETARIAN',
  'SPICY',
];

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function AdminMenuPanel() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await menuApi.listAll();
      setItems(data.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load menu.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      slug: item.slug,
      name: item.name,
      description: item.description,
      price: String(item.price),
      category: item.category,
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
      allergens: item.allergens ?? [],
      dietaryTags: item.dietaryTags ?? [],
      sortOrder: item.sortOrder ?? 0,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        sortOrder: Number(form.sortOrder) || 0,
        imageAlt: form.imageAlt || form.name,
      };

      if (editingId) {
        await menuApi.update(editingId, payload);
        toast.success(`${payload.name} updated.`);
      } else {
        await menuApi.create(payload);
        toast.success(`${payload.name} added to the menu.`);
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailability = async (item) => {
    try {
      await menuApi.setAvailability(item.id, !item.isAvailable);
      toast.success(
        item.isAvailable ? `${item.name} marked unavailable.` : `${item.name} is back on the menu.`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed.');
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Permanently delete “${item.name}”?`)) return;
    try {
      await menuApi.remove(item.id);
      toast.success(`${item.name} deleted.`);
      if (editingId === item.id) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  };

  return (
    <section className="admin_panel" aria-labelledby="menu-admin-heading">
      <div className="admin_toolbar">
        <h2 id="menu-admin-heading">Menu</h2>
        {editingId && (
          <button type="button" className="btn btn-login btn-small" onClick={resetForm}>
            Cancel edit
          </button>
        )}
      </div>

      <form className="menu_admin_form" onSubmit={handleSubmit}>
        <div className="form_row">
          <div className="form_group">
            <label htmlFor="menu-name">Name</label>
            <input
              id="menu-name"
              required
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  slug: editingId ? f.slug : slugify(name),
                  imageAlt: f.imageAlt || name,
                }));
              }}
            />
          </div>
          <div className="form_group">
            <label htmlFor="menu-slug">Slug</label>
            <input
              id="menu-slug"
              required
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div className="form_group">
            <label htmlFor="menu-price">Price (₹)</label>
            <input
              id="menu-price"
              type="number"
              min="1"
              step="1"
              required
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </div>
          <div className="form_group">
            <label htmlFor="menu-category">Category</label>
            <select
              id="menu-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="BREAKFAST">Breakfast</option>
              <option value="LUNCH">Lunch</option>
              <option value="DESSERT">Dessert</option>
            </select>
          </div>
        </div>

        <div className="form_group">
          <label htmlFor="menu-description">Description</label>
          <textarea
            id="menu-description"
            rows={3}
            required
            minLength={10}
            maxLength={600}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="form_row">
          <div className="form_group">
            <label htmlFor="menu-image">Image URL</label>
            <input
              id="menu-image"
              required
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            />
          </div>
          <div className="form_group">
            <label htmlFor="menu-alt">Image alt text</label>
            <input
              id="menu-alt"
              required
              value={form.imageAlt}
              onChange={(e) => setForm((f) => ({ ...f, imageAlt: e.target.value }))}
            />
          </div>
        </div>

        <fieldset className="chip_fieldset">
          <legend>Allergens</legend>
          <div className="chip_row">
            {ALLERGENS.map((a) => (
              <label key={a} className="chip_option">
                <input
                  type="checkbox"
                  checked={form.allergens.includes(a)}
                  onChange={() =>
                    setForm((f) => ({ ...f, allergens: toggleInList(f.allergens, a) }))
                  }
                />
                {a.replace('_', ' ')}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="chip_fieldset">
          <legend>Dietary tags</legend>
          <div className="chip_row">
            {DIETARY_TAGS.map((t) => (
              <label key={t} className="chip_option">
                <input
                  type="checkbox"
                  checked={form.dietaryTags.includes(t)}
                  onChange={() =>
                    setForm((f) => ({ ...f, dietaryTags: toggleInList(f.dietaryTags, t) }))
                  }
                />
                {t.replace('_', ' ')}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editingId ? 'Update dish' : 'Add dish'}
        </button>
      </form>

      {loading ? (
        <p className="menu_state">Loading menu…</p>
      ) : (
        <div className="table_scroll">
          <table className="admin_table">
            <caption className="visually_hidden">Menu items with availability controls</caption>
            <thead>
              <tr>
                <th scope="col">Dish</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    <br />
                    <span className="cell_sub">{item.slug}</span>
                  </td>
                  <td>{item.category}</td>
                  <td>{item.priceLabel}</td>
                  <td>
                    <span
                      className={`status_pill ${item.isAvailable ? 'status_confirmed' : 'status_cancelled'}`}
                    >
                      {item.isAvailable ? 'Available' : '86’d'}
                    </span>
                  </td>
                  <td className="action_cell">
                    <button
                      type="button"
                      className="btn btn-login btn-small"
                      onClick={() => startEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-login btn-small"
                      onClick={() => toggleAvailability(item)}
                    >
                      {item.isAvailable ? '86' : 'Restore'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-login btn-small"
                      onClick={() => removeItem(item)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="cell_empty">
                    No menu items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
