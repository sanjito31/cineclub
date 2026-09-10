"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RevealOnScroll } from "@/app/components/reveal-on-scroll";
import {
  DEFAULT_FINALIST_ORDERING,
  finalistOrderingLabel,
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

const initialValues: RoomDraft = {
  name: "",
  maxParticipants: "8",
  selectionsPerUser: "3",
  requireParticipantCoverage: true,
  finalistOrdering: DEFAULT_FINALIST_ORDERING,
  joinDeadline: "",
  selectionDeadline: "",
  votingDeadline: "",
};

function toIsoDate(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function formatDeadlinePreview(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CreateRoomForm({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();
  const orderingStrategies = listFinalistOrderingStrategies();
  const [values, setValues] = useState<RoomDraft>(initialValues);

  function updateField<K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft: RoomDraft = {
      ...values,
      name: values.name.trim(),
      joinDeadline: toIsoDate(values.joinDeadline),
      selectionDeadline: toIsoDate(values.selectionDeadline),
      votingDeadline: toIsoDate(values.votingDeadline),
    };

    localStorage.setItem(roomDraftStorageKey, JSON.stringify(draft));
    router.push("/create/confirm");
  }

  const joinPreview = formatDeadlinePreview(values.joinDeadline);
  const selectionPreview = formatDeadlinePreview(values.selectionDeadline);
  const votingPreview = formatDeadlinePreview(values.votingDeadline);
  const hasDeadlines = Boolean(joinPreview || selectionPreview || votingPreview);

  return (
    <form className="control-deck" onSubmit={handleSubmit}>
      <div className="control-deck-main">
        <RevealOnScroll index={0}>
          <fieldset className="form-station">
            <legend className="visually-hidden">Basics</legend>
            <div className="station-head">
              <svg className="station-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="station-num">1</span>
              <h2>Basics</h2>
            </div>
            <div className="field-group">
              <label htmlFor="name">Club name</label>
              <input
                id="name"
                name="name"
                minLength={2}
                maxLength={80}
                placeholder="Friday Fright Club"
                required
                autoFocus
                value={values.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
            </div>
            <div className="station-grid">
              <div className="field-group">
                <label htmlFor="maxParticipants">Maximum guests</label>
                <input
                  id="maxParticipants"
                  name="maxParticipants"
                  type="number"
                  min={2}
                  max={20}
                  required
                  value={values.maxParticipants}
                  onChange={(event) => updateField("maxParticipants", event.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="selectionsPerUser">Movies per person</label>
                <input
                  id="selectionsPerUser"
                  name="selectionsPerUser"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={values.selectionsPerUser}
                  onChange={(event) => updateField("selectionsPerUser", event.target.value)}
                />
              </div>
            </div>
          </fieldset>
        </RevealOnScroll>

        <RevealOnScroll index={1}>
          <fieldset className="form-station">
            <legend className="visually-hidden">Rules</legend>
            <div className="station-head">
              <svg className="station-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="station-num">2</span>
              <h2>Rules</h2>
            </div>
            <p className="station-intro">How movies get chosen and revealed.</p>
            <label className="check-field">
              <input
                name="requireParticipantCoverage"
                type="checkbox"
                checked={values.requireParticipantCoverage}
                onChange={(event) => updateField("requireParticipantCoverage", event.target.checked)}
              />
              <span>
                <strong>Represent everyone in required rankings</strong>
                <small>Voters must include at least one nomination connected to each participant.</small>
              </span>
            </label>
            <fieldset className="choice-fields">
              <legend>Reveal order</legend>
              <p>Choose how the finalists are ordered after voting. You can change this later from host controls.</p>
              {orderingStrategies.map((strategy) => (
                <label className="check-field" key={strategy.id}>
                  <input
                    name="finalistOrdering"
                    type="radio"
                    value={strategy.id}
                    checked={values.finalistOrdering === strategy.id}
                    onChange={() => updateField("finalistOrdering", strategy.id)}
                  />
                  <span>
                    <strong>{strategy.label}</strong>
                    <small>{strategy.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </fieldset>
        </RevealOnScroll>

        <RevealOnScroll index={2}>
          <fieldset className="form-station">
            <legend className="visually-hidden">Deadlines</legend>
            <div className="station-head">
              <svg className="station-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="station-num">3</span>
              <h2>Deadlines</h2>
            </div>
            <p className="station-intro">
              Optional decision points. Deadlines won&rsquo;t automatically remove anyone — the host can extend them later.
            </p>
            <div className="deadline-grid">
              <div className="field-group">
                <label htmlFor="joinDeadline">Join by</label>
                <input
                  id="joinDeadline"
                  name="joinDeadline"
                  type="datetime-local"
                  value={values.joinDeadline}
                  onChange={(event) => updateField("joinDeadline", event.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="selectionDeadline">Select by</label>
                <input
                  id="selectionDeadline"
                  name="selectionDeadline"
                  type="datetime-local"
                  value={values.selectionDeadline}
                  onChange={(event) => updateField("selectionDeadline", event.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="votingDeadline">Vote by</label>
                <input
                  id="votingDeadline"
                  name="votingDeadline"
                  type="datetime-local"
                  value={values.votingDeadline}
                  onChange={(event) => updateField("votingDeadline", event.target.value)}
                />
              </div>
            </div>
          </fieldset>
        </RevealOnScroll>

        <button className="button button-primary" type="submit">
          {isAuthenticated ? "Review club" : "Continue to sign in"}
        </button>
      </div>

      <RevealOnScroll index={1} className="control-deck-summary">
        <span className="eyebrow">Live draft</span>
        <h2>{values.name.trim() || "Your club"}</h2>
        <dl>
          <div>
            <dt>Guests</dt>
            <dd>Up to {values.maxParticipants || "—"}</dd>
          </div>
          <div>
            <dt>Selections</dt>
            <dd>{values.selectionsPerUser || "—"} each</dd>
          </div>
          <div>
            <dt>Coverage rule</dt>
            <dd>{values.requireParticipantCoverage ? "Required" : "Optional"}</dd>
          </div>
          <div>
            <dt>Reveal order</dt>
            <dd>{finalistOrderingLabel(parseFinalistOrdering(values.finalistOrdering))}</dd>
          </div>
          {joinPreview && (
            <div>
              <dt>Join by</dt>
              <dd>{joinPreview}</dd>
            </div>
          )}
          {selectionPreview && (
            <div>
              <dt>Select by</dt>
              <dd>{selectionPreview}</dd>
            </div>
          )}
          {votingPreview && (
            <div>
              <dt>Vote by</dt>
              <dd>{votingPreview}</dd>
            </div>
          )}
        </dl>
        {!hasDeadlines && (
          <p className="summary-empty">No deadlines set yet — you can add them anytime before you invite people.</p>
        )}
      </RevealOnScroll>
    </form>
  );
}
