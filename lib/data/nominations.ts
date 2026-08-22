import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  buildNominationDuplicateReport,
  NominationSubmissionError,
  type NominationDuplicateReport,
  type NominationSelection,
  validateNominationSelections,
} from "@/lib/domain/nominations";
import {
  runSerializableRoomTransaction,
  transitionRoomPhaseInTransaction,
} from "@/lib/domain/room-transitions";

export type SubmitNominationsInput = {
  userId: string;
  code: string;
  selections: unknown;
};

export type SubmittedNomination = {
  id: string;
  slotIndex: number;
  roomMovieId: string;
  tmdbId: number;
};

export type SubmitNominationsResult = {
  roomId: string;
  code: string;
  participantId: string;
  submittedAt: string;
  phase: RoomPhase;
  phaseTransitioned: boolean;
  nominations: SubmittedNomination[];
  duplicates: NominationDuplicateReport;
};

export type SubmittedNominationView = {
  slotIndex: number;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
};

export async function getSubmittedNominations(
  roomId: string,
  participantId: string,
): Promise<SubmittedNominationView[]> {
  const nominations = await prisma.nomination.findMany({
    where: { roomId, participantId },
    orderBy: { slotIndex: "asc" },
    select: {
      slotIndex: true,
      roomMovie: {
        select: {
          title: true,
          releaseYear: true,
          posterPath: true,
        },
      },
    },
  });

  return nominations.map((n) => ({
    slotIndex: n.slotIndex,
    title: n.roomMovie.title,
    releaseYear: n.roomMovie.releaseYear,
    posterPath: n.roomMovie.posterPath,
  }));
}

export type RoomMovieNominationSummary = {
  tmdbId: number;
  letterboxdRating: number | null;
  nominatedBy: string[];
};

export async function listRoomMovieNominationSummaries(
  roomId: string,
  tmdbIds: readonly number[],
): Promise<RoomMovieNominationSummary[]> {
  if (tmdbIds.length === 0) {
    return [];
  }

  const movies = await prisma.roomMovie.findMany({
    where: {
      roomId,
      tmdbId: { in: [...tmdbIds] },
    },
    select: {
      tmdbId: true,
      letterboxdRating: true,
      nominations: {
        select: {
          participant: {
            select: {
              user: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });

  return movies.map((movie) => ({
    tmdbId: movie.tmdbId,
    letterboxdRating:
      movie.letterboxdRating === null ? null : Number(movie.letterboxdRating),
    nominatedBy: movie.nominations.map(
      (nomination) => nomination.participant.user.displayName,
    ),
  }));
}

export async function detectNominationDuplicatesInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    roomId: string;
    participantId: string;
    selections: readonly NominationSelection[];
  },
) {
  const existingNominations = await tx.nomination.findMany({
    where: {
      roomId: input.roomId,
      participantId: { not: input.participantId },
      roomMovie: {
        tmdbId: { in: input.selections.map(({ tmdbId }) => tmdbId) },
      },
    },
    select: {
      participantId: true,
      roomMovie: {
        select: { tmdbId: true },
      },
    },
  });

  return buildNominationDuplicateReport(
    input.selections,
    existingNominations.map(({ participantId, roomMovie }) => ({
      participantId,
      tmdbId: roomMovie.tmdbId,
    })),
  );
}

export async function submitNominations(
  input: SubmitNominationsInput,
): Promise<SubmitNominationsResult> {
  return runSerializableRoomTransaction(async (tx) => {
    const room = await tx.room.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        code: true,
        phase: true,
        selectionsPerUser: true,
      },
    });

    if (!room) {
      throw new NominationSubmissionError(
        "ROOM_NOT_FOUND",
        "That room does not exist.",
      );
    }

    const participant = await tx.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: input.userId,
        },
      },
      select: {
        id: true,
        selectionSubmittedAt: true,
      },
    });

    if (!participant) {
      throw new NominationSubmissionError(
        "NOT_PARTICIPANT",
        "You are not a member of this room.",
      );
    }

    if (participant.selectionSubmittedAt) {
      throw new NominationSubmissionError(
        "ALREADY_SUBMITTED",
        "Your movie selections have already been submitted and cannot be changed.",
      );
    }

    if (room.phase !== RoomPhase.SELECTION) {
      throw new NominationSubmissionError(
        "WRONG_PHASE",
        "Room must be in selection to submit nominations.",
      );
    }

    const selections = validateNominationSelections(
      input.selections,
      room.selectionsPerUser,
    );
    const duplicates = await detectNominationDuplicatesInTransaction(tx, {
      roomId: room.id,
      participantId: participant.id,
      selections,
    });

    const nominations: SubmittedNomination[] = [];
    for (const selection of selections) {
      const roomMovie = await tx.roomMovie.upsert({
        where: {
          roomId_tmdbId: {
            roomId: room.id,
            tmdbId: selection.tmdbId,
          },
        },
        create: {
          roomId: room.id,
          tmdbId: selection.tmdbId,
          title: selection.title,
          releaseYear: selection.releaseYear,
          overview: selection.overview,
          posterPath: selection.posterPath,
        },
        update: selection.overview ? { overview: selection.overview } : {},
        select: {
          id: true,
          tmdbId: true,
        },
      });

      const nomination = await tx.nomination.create({
        data: {
          roomId: room.id,
          participantId: participant.id,
          roomMovieId: roomMovie.id,
          slotIndex: selection.slotIndex,
        },
        select: { id: true },
      });

      nominations.push({
        id: nomination.id,
        slotIndex: selection.slotIndex,
        roomMovieId: roomMovie.id,
        tmdbId: roomMovie.tmdbId,
      });
    }

    const submittedAt = new Date();
    const submissionUpdate = await tx.roomParticipant.updateMany({
      where: {
        id: participant.id,
        roomId: room.id,
        selectionSubmittedAt: null,
      },
      data: { selectionSubmittedAt: submittedAt },
    });

    if (submissionUpdate.count !== 1) {
      throw new NominationSubmissionError(
        "ALREADY_SUBMITTED",
        "Your movie selections have already been submitted and cannot be changed.",
      );
    }

    const transition = await transitionRoomPhaseInTransaction(tx, {
      roomId: room.id,
      targetPhase: RoomPhase.VOTING,
    });

    return {
      roomId: room.id,
      code: room.code,
      participantId: participant.id,
      submittedAt: submittedAt.toISOString(),
      phase: transition.phase,
      phaseTransitioned: transition.transitioned,
      nominations,
      duplicates,
    };
  });
}
