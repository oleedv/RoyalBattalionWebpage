"use client";

import { useState, useCallback } from "react";

export function useCrudState() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const startEdit = useCallback((id: string) => {
    setEditingId(id);
    setActionError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setActionError(null);
  }, []);

  const startDelete = useCallback((id: string) => {
    setDeletingId(id);
    setActionError(null);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeletingId(null);
    setActionError(null);
  }, []);

  const clearError = useCallback(() => setActionError(null), []);

  return {
    editingId,
    deletingId,
    actionError,
    actionLoading,
    startEdit,
    cancelEdit,
    startDelete,
    cancelDelete,
    setActionError,
    setActionLoading,
    clearError,
  };
}
