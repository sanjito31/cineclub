"use client";

import { useEffect } from "react";
import { roomDraftStorageKey } from "@/app/create/create-room-form";

export function ClearRoomDraft() {
  useEffect(() => {
    localStorage.removeItem(roomDraftStorageKey);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return null;
}
