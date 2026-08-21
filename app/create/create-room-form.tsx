"use client";

import { useRouter } from "next/navigation";
import { type FormEvent } from "react";
import {
  DEFAULT_FINALIST_ORDERING,
  listFinalistOrderingStrategies,
  parseFinalistOrdering,
} from "@/lib/domain/finalist-ordering";

export const roomDraftStorageKey = "cineclub:create-room-draft";

export type RoomDraft = {
  name: string;
  maxParticipants: string;
  selectionsPerUser: string;
  requireParticipantCoverage: boolean;
  finalistOrdering: string;
  joinDeadline: string;
  selectionDeadline: string;
  votingDeadline: string;
};

export function CreateRoomForm({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();
  const orderingStrategies = listFinalistOrderingStrategies();

  function toIsoDate(value: FormDataEntryValue | null) {
    const text = String(value ?? "");
    return text ? new Date(text).toISOString() : "";
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const draft: RoomDraft = {
      name: String(data.get("name") ?? "").trim(),
      maxParticipants: String(data.get("maxParticipants") ?? "8"),
      selectionsPerUser: String(data.get("selectionsPerUser") ?? "3"),
      requireParticipantCoverage: data.get("requireParticipantCoverage") === "on",
      finalistOrdering: parseFinalistOrdering(String(data.get("finalistOrdering") ?? "")),
      joinDeadline: toIsoDate(data.get("joinDeadline")),
      selectionDeadline: toIsoDate(data.get("selectionDeadline")),
      votingDeadline: toIsoDate(data.get("votingDeadline")),
    };

    localStorage.setItem(roomDraftStorageKey, JSON.stringify(draft));
    router.push("/create/confirm");
  }

  return (
    <form className="room-form" onSubmit={handleSubmit}>
      <div className="field-group field-span">
        <label htmlFor="name">Room name</label>
        <input id="name" name="name" minLength={2} maxLength={80} placeholder="Friday Fright Club" required autoFocus />
      </div>
      <div className="field-group">
        <label htmlFor="maxParticipants">Maximum guests</label>
        <input id="maxParticipants" name="maxParticipants" type="number" min={2} max={20} defaultValue={8} required />
      </div>
      <div className="field-group">
        <label htmlFor="selectionsPerUser">Movies per person</label>
        <input id="selectionsPerUser" name="selectionsPerUser" type="number" min={1} max={10} defaultValue={3} required />
      </div>
      <label className="check-field field-span">
        <input name="requireParticipantCoverage" type="checkbox" defaultChecked />
        <span>
          <strong>Represent everyone in required rankings</strong>
          <small>Voters must include at least one nomination connected to each participant.</small>
        </span>
      </label>
      <fieldset className="choice-fields field-span">
        <legend>Reveal order</legend>
        <p>Choose how the finalists are ordered after voting. You can change this later from host controls.</p>
        {orderingStrategies.map((strategy) => (
          <label className="check-field" key={strategy.id}>
            <input
              name="finalistOrdering"
              type="radio"
              value={strategy.id}
              defaultChecked={strategy.id === DEFAULT_FINALIST_ORDERING}
            />
            <span>
              <strong>{strategy.label}</strong>
              <small>{strategy.description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="deadline-fields field-span">
        <legend>Optional decision points</legend>
        <p>Deadlines won’t automatically remove anyone. The host can extend them later.</p>
        <div className="deadline-grid">
          <div className="field-group">
            <label htmlFor="joinDeadline">Join by</label>
            <input id="joinDeadline" name="joinDeadline" type="datetime-local" />
          </div>
          <div className="field-group">
            <label htmlFor="selectionDeadline">Select by</label>
            <input id="selectionDeadline" name="selectionDeadline" type="datetime-local" />
          </div>
          <div className="field-group">
            <label htmlFor="votingDeadline">Vote by</label>
            <input id="votingDeadline" name="votingDeadline" type="datetime-local" />
          </div>
        </div>
      </fieldset>
      <button className="button button-primary field-span" type="submit">
        {isAuthenticated ? "Review room" : "Continue to sign in"}
      </button>
    </form>
  );
}
