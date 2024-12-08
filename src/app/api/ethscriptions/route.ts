import { and, asc, desc, eq, gt, gte, like, lt, lte, sql } from 'drizzle-orm';
// NOTE: used for selecting proper operators for the where clause
import * as orm from 'drizzle-orm';

import { db } from '@/db';
import { collections, transactions, transfers, votes } from '@/db/schema';
import { ethscriptions } from '@/db/schema/index.ts';
import { ethscriptionParamsSchema } from '@/utils/params-validation';
import { withValidation } from '@/utils/validation';

// /api/ethscriptions?limit=50

// &expand=collection,transfers,votes
// &exclude=is*,media*,*owner,collection.*,transfers.*
// &include=current_owner,collection.name,collection.desc*,transfers.*address,transfers.transaction_hash
// &collection_id=true
// &block_number=range:4000,5000
// &transaction_index=gt:10
// &content_sha=1DF4*
// &creator=0xa20c*

// can use nested `where` clause too
// &where[block_number][gt]=4535&where[block_number][lt]=4545
// &where[content_sha][like]=*F591*
// &where[content_sha][like]=0x*73e*
// &where[content_sha][like]=0xF591*
// &where[media_subtype][like]=vnd.*

// can have cursor-based pagination with `page_key={1}_{2}` where first is block_number, second is transaction_index
// &page_key=4000_10

// can have page-based pagination too, just use `page=3`, there's also `next` and `prev` for navigation

export const GET = withValidation(ethscriptionParamsSchema, async (req, { searchQuery }) => {
  const searchParams = new URL(req.url).searchParams;
  const offset = searchQuery.page_key ? 0 : (searchQuery.page - 1) * searchQuery.page_size;

  // Base query with ethscriptions fields
  const baseQuery = {
    id: ethscriptions.id,
    number: ethscriptions.number,
    block_number: ethscriptions.block_number,
    block_timestamp: ethscriptions.block_timestamp,
    transaction_index: ethscriptions.transaction_index,

    media_type: ethscriptions.media_type,
    media_subtype: ethscriptions.media_subtype,
    content_type: ethscriptions.content_type,
    content_sha: ethscriptions.content_sha,

    is_esip0: ethscriptions.is_esip0,
    is_esip3: ethscriptions.is_esip3,
    is_esip4: ethscriptions.is_esip4,
    is_esip6: ethscriptions.is_esip6,
    is_esip8: ethscriptions.is_esip8,

    creator: ethscriptions.creator,
    initial_owner: ethscriptions.initial_owner,
    current_owner: ethscriptions.current_owner,
    previous_owner: ethscriptions.previous_owner,

    updated_at: ethscriptions.updated_at,
    collection_id: ethscriptions.collection_id,

    total: sql<number>`COUNT(*) OVER()`,
  };

  // Add expanded relations to query
  if (searchQuery.expand) {
    if (searchQuery.expand.includes('collection')) {
      Object.assign(baseQuery, {
        collection: {
          id: collections.id,
          supply: collections.supply,
          slug: collections.slug,
          name: collections.name,
          description: collections.description,
          logo: collections.logo,
          banner: collections.banner,
          links: collections.links,
          team: collections.team,
          royalties: collections.royalties,
          verified: collections.verified,
          created_at: collections.created_at,
        },
      });
    }

    if (searchQuery.expand.includes('metadata')) {
      Object.assign(baseQuery, {
        metadata: {
          block_number: transactions.block_number,
          block_blockhash: transactions.block_blockhash,
          block_timestamp: transactions.block_timestamp,
          transaction_type: transactions.transaction_type,
          transaction_hash: transactions.transaction_hash,
          transaction_index: transactions.transaction_index,
          transaction_value: transactions.transaction_value,
          transaction_fee: transactions.transaction_fee,
          gas_price: transactions.gas_price,
          gas_used: transactions.gas_used,
          from_address: transactions.from_address,
          to_address: transactions.to_address,
          is_transfer: transactions.is_transfer,
          truncated_data: transactions.truncated_data,
          truncated_data_raw: transactions.truncated_data_raw,
        },
      });
    }

    if (searchQuery.expand.includes('transfers')) {
      Object.assign(baseQuery, {
        transfers: {
          transaction_hash: transfers.transaction_hash,
          ethscription_id: transfers.ethscription_id,
          index: transfers.index,
          event_log_index: transfers.event_log_index,
          block_blockhash: transfers.block_blockhash,
          block_number: transfers.block_number,
          block_timestamp: transfers.block_timestamp,
          transaction_index: transfers.transaction_index,
          from_address: transfers.from_address,
          to_address: transfers.to_address,
        },
      });
    }

    if (searchQuery.expand.includes('votes')) {
      Object.assign(baseQuery, {
        votes: {
          id: votes.id,
          transaction_hash: votes.transaction_hash,
          ethscription_id: votes.ethscription_id,
          timestamp: votes.timestamp,
          voter: votes.voter,
          rank: votes.rank,
          up: votes.up,
          down: votes.down,
        },
      });
    }
  }

  const query = db.select(baseQuery).from(ethscriptions);

  // Add joins for expanded relations
  if (searchQuery.expand) {
    if (searchQuery.expand.includes('collection')) {
      query.leftJoin(collections, eq(ethscriptions.collection_id, collections.id));
    }

    if (searchQuery.expand.includes('metadata')) {
      query.leftJoin(transactions, eq(ethscriptions.id, transactions.transaction_hash));
    }

    if (searchQuery.expand.includes('transfers')) {
      query.leftJoin(transfers, eq(ethscriptions.id, transfers.ethscription_id));
    }

    if (searchQuery.expand.includes('votes')) {
      query.leftJoin(votes, eq(ethscriptions.id, votes.ethscription_id));
    }
  }

  const conditions: any[] = [];

  // Number-based filters with comparison operators
  ['number', 'block_number', 'block_timestamp', 'transaction_index', 'updated_at'].forEach(
    (field) => {
      if (searchParams.has(field)) {
        const val = searchQuery[field];
        const value = (val as any).value ?? val;
        const [op, num] = searchParams.get(field)?.includes(':') ? [val.op, value] : ['eq', value];

        switch (op) {
          case 'gt':
            conditions.push(gt(ethscriptions[field], num));
            break;
          case 'lt':
            conditions.push(lt(ethscriptions[field], num));
            break;
          case 'gte':
            conditions.push(gte(ethscriptions[field], num));
            break;
          case 'lte':
            conditions.push(lte(ethscriptions[field], num));
            break;
          case 'range':
            const { min, max } = val;
            conditions.push(gte(ethscriptions[field], min), lte(ethscriptions[field], max));
            break;
          default:
            conditions.push(eq(ethscriptions[field], num));
        }
      }
    },
  );

  if (searchQuery.collection_id) {
    const value = searchQuery.collection_id;

    if (value === 'true') {
      // Filter for non-null collection_ids
      conditions.push(sql`${ethscriptions.collection_id} IS NOT NULL`);
    } else if (value === 'false' || value === 'null') {
      // Filter for null collection_ids
      conditions.push(sql`${ethscriptions.collection_id} IS NULL`);
    } else {
      // Regular text search with wildcard support
      const val = value.includes('*') ? value.replace(/\*/g, '%') : value;
      conditions.push(
        value.includes('*')
          ? like(ethscriptions.collection_id, val)
          : eq(ethscriptions.collection_id, val),
      );
    }
  }

  // Text-based filters with support for like operator
  [
    'id',
    'media_type',
    'media_subtype',
    'content_type',
    'content_sha',
    'creator',
    'initial_owner',
    'current_owner',
    'previous_owner',
  ].forEach((field) => {
    if (searchParams.has(field)) {
      const value = searchQuery[field];
      const val = value.includes('*') ? value.replace(/\*/g, '%') : value;
      conditions.push(
        value.includes('*') ? like(ethscriptions[field], val) : eq(ethscriptions[field], val),
      );
    }
  });

  // Boolean ESIP filters
  ['is_esip0', 'is_esip3', 'is_esip4', 'is_esip6', 'is_esip8'].forEach((field) => {
    if (searchParams.has(field)) {
      conditions.push(eq(ethscriptions[field], searchQuery[field]));
    }
  });

  // Apply conditions and pagination
  if (conditions.length) {
    query.where(and(...conditions));
  }

  const isCursor = searchQuery.page_key ? searchQuery.page_key.length > 0 : false;
  const isAscending = searchQuery.order === 'asc';
  const order = isAscending ? asc : desc;

  if (isCursor) {
    // Parse the composite cursor
    const [blockNumber, txIndex] = searchQuery.page_key?.split('_').map(Number) as [number, number];

    // Add cursor conditions using block_number and transaction_index
    if (isAscending) {
      conditions.push(
        sql`(${ethscriptions.block_number}, ${ethscriptions.transaction_index}) > (${blockNumber}, ${txIndex})`,
      );
    } else {
      conditions.push(
        sql`(${ethscriptions.block_number}, ${ethscriptions.transaction_index}) < (${blockNumber}, ${txIndex})`,
      );
    }
  }

  // Apply conditions and ordering, if it's not a `where` query param clause
  // if it is a `where` clause, then we construct the query based on the `where` object
  if (!searchQuery.where && conditions.length) {
    query.where(and(...conditions));
  } else if (searchQuery.where) {
    const conds: any = [];

    // searchQuery.where.block_number?.eq;
    // searchQuery.where.number?.eq;
    // searchQuery.where.block_number?.gt;
    // searchQuery.where.block_number?.like;
    // searchQuery.where.content_sha?.like;
    // searchQuery.where.content_sha?.eq;

    // NOTE: the autocompletion for `searchQuery.where.block_number.gt` works,
    // but the type of `searchQuery.where` on hover is not inferred correctly (it's `searchQuery.where: ZodSchema`
    // instead of `searchQuery.where: Record<Operators, any>`)
    for (const [key, spec] of Object.entries(searchQuery.where)) {
      for (const [op, value] of Object.entries(spec) as [string, any][]) {
        const val = value.includes('*') ? value.replace(/\*/g, '%') : value;

        console.log({ op, key, val, value, spec });
        conds.push(orm[op](ethscriptions[key], val));
      }
    }
    query.where(and(...conds));
  }

  // Order by both block_number and transaction_index
  query.orderBy(order(ethscriptions.block_number), order(ethscriptions.transaction_index));
  query.limit(searchQuery.page_size);

  if (!isCursor) {
    query.offset(offset);
  }

  const results = await query;
  const total = results[0]?.total ?? 0;
  const left = total - searchQuery.page_size;
  const has_next = total > offset + searchQuery.page_size ? searchQuery.page + 1 : null;
  const nextCursor = has_next
    ? `${results[results.length - 1]?.block_number}_${results[results.length - 1]?.transaction_index}`
    : null;

  // Process include/exclude filters with nested support
  let filteredData = results.map(({ total, ...item }) => item);

  const include = searchQuery.include?.split(',').filter(Boolean);
  const exclude = searchQuery.exclude?.split(',').filter(Boolean);

  if (include || exclude) {
    filteredData = filteredData.map((item: any): any => {
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
              typeof value === 'object' && value !== null ? processObject(value, fullPath) : value;
          }
        });
        return result;
      };

      return processObject(item);
    });
  }

  return {
    pagination: isCursor
      ? {
          total,
          items_left: left < 0 ? 0 : left,
          page_size: searchQuery.page_size,
          page_key: nextCursor || null,
          has_more: left > 0,
        }
      : {
          total,
          limit: searchQuery.page_size,
          pages: Math.ceil(total / searchQuery.page_size),
          page: searchQuery.page,
          prev: searchQuery.page > 1 ? searchQuery.page - 1 : null,
          next: has_next,
          page_key: nextCursor || null,
          has_more: Boolean(has_next),
        },
    data: filteredData,
    status: 200,
  };
});
