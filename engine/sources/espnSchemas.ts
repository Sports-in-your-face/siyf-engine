import { z } from 'zod';

export const EspnSeasonStatisticsSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      labels: z.array(z.string()).optional(),
      statistics: z.array(
        z.object({
          season: z.object({
            displayName: z.string().optional(),
            year: z.number().optional()
          }).optional(),
          teamSlug: z.string().optional(),
          stats: z.array(z.string().or(z.number())).optional()
        })
      ).optional()
    })
  ).optional(),
  teams: z.record(z.string(), z.any()).optional()
}).passthrough();

export const EspnGameLogSchema = z.object({
  gameLog: z.object({
    statistics: z.array(
      z.object({
        labels: z.array(z.string()).optional(),
        events: z.array(
          z.object({
            eventId: z.string(),
            stats: z.array(z.string().or(z.number())).optional()
          })
        ).optional()
      })
    ).optional(),
    events: z.record(
      z.string(),
      z.object({
        gameDate: z.string().optional(),
        gameResult: z.string().optional(),
        score: z.string().optional(),
        atVs: z.string().optional(),
        opponent: z.object({
          abbreviation: z.string().optional(),
          displayName: z.string().optional()
        }).optional()
      })
    ).optional()
  }).optional()
}).passthrough();

export const EspnPlayerDetailsSchema = z.object({
  bio: z.object({
    athlete: z.object({
      displayName: z.string().optional(),
      position: z.object({ abbreviation: z.string().optional() }).optional(),
      jersey: z.string().optional(),
      displayHeight: z.string().optional(),
      displayWeight: z.string().optional(),
      headshot: z.union([z.string(), z.object({ href: z.string().optional() })]).optional(),
      debutYear: z.number().optional(),
      team: z.object({
        color: z.string().optional(),
        alternateColor: z.string().optional()
      }).optional()
    }).optional()
  }).optional(),
  overview: z.object({
    statistics: z.object({
      labels: z.array(z.string()).optional(),
      splits: z.array(
        z.object({
          displayName: z.string(),
          stats: z.array(z.string().or(z.number())).optional(),
        }),
      ).optional(),
    }).optional(),
    awards: z.array(
      z.object({
        name: z.string().optional(),
        displayCount: z.string().optional(),
        seasons: z.array(z.string().or(z.number())).optional(),
      }),
    ).optional(),
    gameLog: EspnGameLogSchema.shape.gameLog.optional(),
  }).optional(),
  stats: EspnSeasonStatisticsSchema.optional(),
}).passthrough();
