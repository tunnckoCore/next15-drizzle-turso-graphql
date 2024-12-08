// import { and, asc, desc, eq, gt, gte, like, lt, lte } from 'drizzle-orm';
// NOTE: used for selecting proper operators for the where clause
import * as orm from 'drizzle-orm';

import { db } from '@/db/index.ts';
import { ethscriptions } from '@/db/schema/ethscriptions.ts';
import { ethscriptionParamsSchema } from '@/utils/params-validation.ts';
import { withValidation } from '@/utils/validation.ts';

// GET /ethscriptions/:id - Get a single collection by ID (ethscriptions.id or ethscriptions.slug)
export const GET = withValidation(
  ethscriptionParamsSchema,
  async (req, { params, searchQuery }) => {
    const segments = await params;
    const searchParams = new URL(req.url).searchParams;
    console.log('the /ethscriptions/:id endpoint', searchQuery, segments);
    const query = db
      .select()
      .from(ethscriptions)
      .where(
        orm.or(
          orm.eq(ethscriptions.id, segments.id as string),
          orm.eq(ethscriptions.number, segments.id as number),
        ),
      );
    let results = await query;

    if (results.length === 0) {
      return {
        status: 404,
        message: 'Ethscription not found',
        error: {
          issues: [
            {
              code: 'not_found',
              message: 'This transaction does not exist, or there is no Ethscription on it.',
              keys: [segments.id],
              path: [],
            },
          ],
        },
      };
    }

    const include = searchQuery.include?.split(',').filter(Boolean);
    const exclude = searchQuery.exclude?.split(',').filter(Boolean);

    if (include || exclude) {
      results = results.map((item: any): any => {
        const processObject = (obj: any, prefix = ''): any => {
          if (!obj || typeof obj !== 'object') return obj;

          const result: Record<string, any> = {};
          Object.entries(obj).forEach(([key, value]) => {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            let shouldInclude = true;

            if (exclude) {
              // Check if field or its parent should be excluded
              const isExcluded = exclude.some((pattern) => {
                if (pattern.includes('*')) {
                  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
                  const regex = new RegExp(`^${regexPattern}$`);
                  return regex.test(fullPath);
                }
                return fullPath === pattern || pattern === `${fullPath}.*`;
              });
              shouldInclude = !isExcluded;
            }

            if (include) {
              // Include can override exclude for specific fields
              const isIncluded = include.some((pattern) => {
                if (pattern.includes('*')) {
                  const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
                  const regex = new RegExp(`^${regexPattern}$`);
                  return regex.test(fullPath);
                }
                return fullPath === pattern;
              });
              if (isIncluded) {
                shouldInclude = true;
              }
            }

            if (shouldInclude) {
              result[key] =
                typeof value === 'object' && value !== null
                  ? processObject(value, fullPath)
                  : value;
            }
          });
          return result;
        };

        return processObject(item);
      });
    }

    const [ethscription] = results;
    return { data: ethscription };
  },
);