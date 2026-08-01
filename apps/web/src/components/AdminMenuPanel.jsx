import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { ApiError, menuApi } from '../lib/api.js';
import {
  MENU_ALLERGENS,
  MENU_CATEGORIES,
  MENU_DIETARY_TAGS,
  validateCreateMenuItem,
  validateUpdateMenuItem,
} from '../lib/menuValidation.js';

/**
 * Admin menu CRUD — Phase 5. The public menu already reads from the DB;
 * this is how staff add, price-edit, 86, or remove dishes without redeploying.
 *
 * Scoped by restaurantSlug from the dashboard switcher. Server still enforces
 * requireRestaurantAdmin; client validation mirrors menu.schemas.js.
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
  isAvailable: true,
};

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

export function AdminMenuPanel({ restaurantSlug }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantSlug) return;
    setLoading(true);
    try {
      const data = await menuApi.listAll(restaurantSlug);
      setItems(data.items);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load menu.');
    } finally {
      setLoading(false);
    }
  }, [restaurantSlug, toast]);

  const resetForm = () => {
    setForm(EMPTY);
    setFieldErrors({});
    setEditingId(null);
  };

  useEffect(() => {
    resetForm();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const clearFieldError = (field) => {
    setFieldErrors((errors) => {
      if (!errors[field]) return errors;
      const next = { ...errors };
      delete next[field];
      return next;
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setFieldErrors({});
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
      isAvailable: item.isAvailable !== false,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFieldErrors({});

    const raw = {
      ...form,
      price: form.price,
      sortOrder: form.sortOrder,
      imageAlt: form.imageAlt || form.name,
      restaurantSlug,
    };

    const validated = editingId ? validateUpdateMenuItem(raw) : validateCreateMenuItem(raw);

    if (!validated.ok) {
      setFieldErrors(validated.errors);
      toast.error('Please check the highlighted fields.');
      setBusy(false);
      return;
    }

    try {
      if (editingId) {
        await menuApi.update(editingId, validated.data);
        toast.success(`${validated.data.name ?? form.name} updated.`);
      } else {
        await menuApi.create(validated.data);
        toast.success(`${validated.data.name} added to the menu.`);
      }
      resetForm();
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.details && typeof err.details === 'object') {
        setFieldErrors(err.details);
        toast.error('Please check the highlighted fields.');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Save failed.');
      }
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

      <form className="menu_admin_form" onSubmit={handleSubmit} noValidate>
        <div className="form_row">
          <div className="form_group">
            <label htmlFor="menu-name">Name</label>
            <input
              id="menu-name"
              required
              value={form.name}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'menu-name-error' : undefined}
              onChange={(e) => {
                const name = e.target.value;
                clearFieldError('name');
                setForm((f) => ({
                  ...f,
                  name,
                  slug: editingId ? f.slug : slugify(name),
                  imageAlt: f.imageAlt || name,
                }));
              }}
            />
            {fieldErrors.name && (
              <p className="field_error" id="menu-name-error">
                {fieldErrors.name}
              </p>
            )}
          </div>
          <div className="form_group">
            <label htmlFor="menu-slug">Slug</label>
            <input
              id="menu-slug"
              required
              value={form.slug}
              aria-invalid={Boolean(fieldErrors.slug)}
              aria-describedby={fieldErrors.slug ? 'menu-slug-error' : undefined}
              onChange={(e) => {
                clearFieldError('slug');
                setForm((f) => ({ ...f, slug: e.target.value }));
              }}
            />
            {fieldErrors.slug && (
              <p className="field_error" id="menu-slug-error">
                {fieldErrors.slug}
              </p>
            )}
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
              aria-invalid={Boolean(fieldErrors.price)}
              aria-describedby={fieldErrors.price ? 'menu-price-error' : undefined}
              onChange={(e) => {
                clearFieldError('price');
                setForm((f) => ({ ...f, price: e.target.value }));
              }}
            />
            {fieldErrors.price && (
              <p className="field_error" id="menu-price-error">
                {fieldErrors.price}
              </p>
            )}
          </div>
          <div className="form_group">
            <label htmlFor="menu-category">Category</label>
            <select
              id="menu-category"
              value={form.category}
              aria-invalid={Boolean(fieldErrors.category)}
              onChange={(e) => {
                clearFieldError('category');
                setForm((f) => ({ ...f, category: e.target.value }));
              }}
            >
              {MENU_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            {fieldErrors.category && <p className="field_error">{fieldErrors.category}</p>}
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
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? 'menu-description-error' : undefined}
            onChange={(e) => {
              clearFieldError('description');
              setForm((f) => ({ ...f, description: e.target.value }));
            }}
          />
          {fieldErrors.description && (
            <p className="field_error" id="menu-description-error">
              {fieldErrors.description}
            </p>
          )}
        </div>

        <div className="form_row">
          <div className="form_group">
            <label htmlFor="menu-image">Image URL</label>
            <input
              id="menu-image"
              required
              value={form.imageUrl}
              aria-invalid={Boolean(fieldErrors.imageUrl)}
              aria-describedby={fieldErrors.imageUrl ? 'menu-image-error' : undefined}
              onChange={(e) => {
                clearFieldError('imageUrl');
                setForm((f) => ({ ...f, imageUrl: e.target.value }));
              }}
            />
            {fieldErrors.imageUrl && (
              <p className="field_error" id="menu-image-error">
                {fieldErrors.imageUrl}
              </p>
            )}
          </div>
          <div className="form_group">
            <label htmlFor="menu-alt">Image alt text</label>
            <input
              id="menu-alt"
              required
              value={form.imageAlt}
              aria-invalid={Boolean(fieldErrors.imageAlt)}
              aria-describedby={fieldErrors.imageAlt ? 'menu-alt-error' : undefined}
              onChange={(e) => {
                clearFieldError('imageAlt');
                setForm((f) => ({ ...f, imageAlt: e.target.value }));
              }}
            />
            {fieldErrors.imageAlt && (
              <p className="field_error" id="menu-alt-error">
                {fieldErrors.imageAlt}
              </p>
            )}
          </div>
          <div className="form_group">
            <label htmlFor="menu-sort">Sort order</label>
            <input
              id="menu-sort"
              type="number"
              min="0"
              step="1"
              value={form.sortOrder}
              aria-invalid={Boolean(fieldErrors.sortOrder)}
              onChange={(e) => {
                clearFieldError('sortOrder');
                setForm((f) => ({ ...f, sortOrder: e.target.value }));
              }}
            />
            {fieldErrors.sortOrder && <p className="field_error">{fieldErrors.sortOrder}</p>}
          </div>
        </div>

        <fieldset className="chip_fieldset">
          <legend>Allergens</legend>
          <div className="chip_row">
            {MENU_ALLERGENS.map((a) => (
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
            {MENU_DIETARY_TAGS.map((t) => (
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

        <label className="chip_option availability_toggle">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
          />
          Available on the public menu
        </label>

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
