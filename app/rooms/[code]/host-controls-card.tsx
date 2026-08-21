"use client";

import { useState, useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import {
  listFinalistOrderingStrategies,
  type FinalistOrdering,
} from "@/lib/domain/finalist-ordering";

type FormAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function HostControlsCard({
  code,
  roomName,
  maxParticipants,
  selectionsPerUser,
  requireParticipantCoverage,
  currentOrdering,
  locked,
  updateSettingsAction,
  renameAction,
  deleteAction,
}: {
  code: string;
  roomName: string;
  maxParticipants: number;
  selectionsPerUser: number;
  requireParticipantCoverage: boolean;
  currentOrdering: FinalistOrdering;
  locked: boolean;
  updateSettingsAction: FormAction;
  renameAction: FormAction;
  deleteAction: FormAction;
}) {
  const [settingsState, doSettings, settingsPending] = useActionState(
    updateSettingsAction,
    { status: "idle" } satisfies ActionState,
  );
  const [renameState, doRename, renamePending] = useActionState(
    renameAction,
    { status: "idle" } satisfies ActionState,
  );
  const [deleteState, doDelete, deletePending] = useActionState(
    deleteAction,
    { status: "idle" } satisfies ActionState,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <section className="panel host-settings-card">
      <span className="eyebrow">Host controls</span>
      <h2>Room Settings</h2>

      <form action={doRename} className="settings-form">
        <input name="code" type="hidden" value={code} />
        <div className="setting-row">
          <label htmlFor="roomName">Room name</label>
          <div className="setting-rename">
            <input
              id="roomName"
              name="name"
              type="text"
              defaultValue={roomName}
              disabled={renamePending}
              className="setting-text-input"
              maxLength={80}
              minLength={2}
              required
            />
            <button
              className="button button-primary button-xs"
              disabled={renamePending}
              type="submit"
            >
              {renamePending ? "Saving…" : "Rename"}
            </button>
          </div>
        </div>
        <ActionMessage status={renameState.status} message={renameState.message} />
      </form>

      <form action={doSettings} className="settings-form">
        <input name="code" type="hidden" value={code} />

        <div className="setting-row">
          <label htmlFor="maxParticipants">Max participants</label>
          <select
            id="maxParticipants"
            name="maxParticipants"
            defaultValue={maxParticipants}
            disabled={settingsPending || locked}
            className="setting-select"
          >
            {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label htmlFor="selectionsPerUser">Movies per person</label>
          <select
            id="selectionsPerUser"
            name="selectionsPerUser"
            defaultValue={selectionsPerUser}
            disabled={settingsPending || locked}
            className="setting-select"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label htmlFor="requireParticipantCoverage">Require participant coverage</label>
          <input
            id="requireParticipantCoverage"
            name="requireParticipantCoverage"
            type="checkbox"
            defaultChecked={requireParticipantCoverage}
            disabled={settingsPending || locked}
            className="setting-checkbox"
          />
        </div>

        <div className="setting-row setting-row-ordering">
          <span className="setting-ordering-label">Reveal order</span>
          <div className="setting-radios" role="radiogroup" aria-label="Reveal order">
            {listFinalistOrderingStrategies().map((strategy) => (
              <label className="setting-radio" key={strategy.id}>
                <input
                  name="finalistOrdering"
                  type="radio"
                  value={strategy.id}
                  defaultChecked={strategy.id === currentOrdering}
                  disabled={settingsPending || locked}
                />
                <span>{strategy.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="setting-row-actions">
          {locked ? (
            <small>Settings are locked after selection.</small>
          ) : (
            <button
              className="button button-primary button-small"
              disabled={settingsPending}
              type="submit"
            >
              {settingsPending ? "Saving…" : "Save Changes"}
            </button>
          )}
          <ActionMessage status={settingsState.status} message={settingsState.message} />
        </div>
      </form>

      <div className="danger-zone">
        <div className="danger-zone-header">
          <strong>Danger zone</strong>
        </div>
        {confirmDelete ? (
          <div className="danger-zone-confirm">
            <p>This will permanently delete the room, all nominations, votes, and results. This cannot be undone.</p>
            <div className="danger-zone-actions">
              <form action={doDelete}>
                <input name="code" type="hidden" value={code} />
                <button
                  className="button button-danger button-small"
                  disabled={deletePending}
                  type="submit"
                >
                  {deletePending ? "Deleting…" : "Yes, delete this room"}
                </button>
              </form>
              <button
                className="button button-secondary button-small"
                onClick={() => setConfirmDelete(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
            {deleteState.status === "error" ? (
              <ActionMessage status={deleteState.status} message={deleteState.message} />
            ) : null}
          </div>
        ) : (
          <div className="setting-row">
            <span className="danger-zone-label">Delete this room permanently</span>
            <button
              className="button button-danger-outline button-xs"
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              Delete room
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
