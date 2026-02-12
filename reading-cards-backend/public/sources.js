
const API_BASE = '/api/sources';

let currentSources = [];

// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
    fetchSources();

    // Form Submit Handler
    document.getElementById('sourceForm').addEventListener('submit', handleFormSubmit);
});

// === API Calls ===

async function fetchSources() {
    try {
        const res = await fetch(API_BASE);
        const data = await res.json();
        currentSources = data.sources || [];
        renderTable(currentSources);
    } catch (err) {
        console.error('Failed to fetch sources:', err);
        alert('Failed to load sources');
    }
}

async function saveSource(sourceData) {
    const isEdit = !!sourceData.id;
    const url = isEdit ? `${API_BASE}/${sourceData.id}` : API_BASE;
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceData)
    });

    if (!res.ok) throw new Error('Save failed');
    return await res.json();
}

async function deleteSource(id) {
    if (!confirm('Are you sure you want to delete this source? This might affect existing cards.')) return;

    try {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        fetchSources(); // Refresh
    } catch (err) {
        console.error(err);
        alert('Failed to delete source');
    }
}


// === UI Rendering ===

function renderTable(sources) {
    const tbody = document.getElementById('sourceListBody');
    tbody.innerHTML = '';

    sources.forEach(source => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:600; color:var(--text-primary);">${source.name}</div>
                <div style="font-size:12px; color:var(--text-tertiary); margin-top:4px;">
                    <a href="${source.url}" target="_blank" style="color:inherit; text-decoration:none;">${new URL(source.url || 'http://#').hostname}</a>
                </div>
            </td>
            <td><span class="source-category-tag">${source.category}</span></td>
            <td>
                <div style="display:flex; align-items:center;">
                    <span class="importance-badge imp-${source.importance_level}"></span>
                    <span>Level ${source.importance_level}</span>
                </div>
            </td>
            <td>${source.region === 'overseas' ? '🌍 Overseas' : '🇨🇳 Domestic'}</td>
            <td>
                <button class="action-btn" onclick="openEditModal('${source.source_id}')">Edit</button>
                <button class="action-btn delete" onclick="deleteSource('${source.source_id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


// === Modal Logic ===

window.openModal = function () {
    document.getElementById('sourceForm').reset();
    document.getElementById('sourceId').value = '';
    document.getElementById('modalTitle').textContent = 'Add Source';
    document.getElementById('sourceModal').classList.add('active');
}

window.openEditModal = function (id) {
    const source = currentSources.find(s => s.source_id === id);
    if (!source) return;

    document.getElementById('sourceId').value = source.source_id;
    document.getElementById('name').value = source.name;
    document.getElementById('url').value = source.url;
    document.getElementById('category').value = source.category;
    document.getElementById('importance_level').value = source.importance_level;
    document.getElementById('region').value = source.region;
    document.getElementById('description').value = source.description || '';

    document.getElementById('modalTitle').textContent = 'Edit Source';
    document.getElementById('sourceModal').classList.add('active');
}

window.closeModal = function () {
    document.getElementById('sourceModal').classList.remove('active');
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('sourceId').value;
    const data = {
        name: document.getElementById('name').value,
        url: document.getElementById('url').value,
        category: document.getElementById('category').value,
        importance_level: parseInt(document.getElementById('importance_level').value),
        region: document.getElementById('region').value,
        description: document.getElementById('description').value
    };

    if (id) data.id = id; // For PATCH

    try {
        await saveSource(data);
        closeModal();
        fetchSources();
    } catch (err) {
        console.error(err);
        alert('Failed to save source');
    }
}
