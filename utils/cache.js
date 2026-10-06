class TTLCache {
  constructor(defaultTtlMs) {
    this.defaultTtlMs = defaultTtlMs;
    this.items = new Map();
  }

  get(key) {
    const item = this.items.get(key);

    if (!item) {
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.items.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.items.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key) {
    this.items.delete(key);
  }

  clear() {
    this.items.clear();
  }
}

module.exports = TTLCache;
