import { Databases, ID, Query } from "node-appwrite";
import { notFoundError } from "@fairlx/mcp-server";
import type { McpQuery, McpStore } from "@fairlx/mcp-server";

function isAppwriteNotFound(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 404
  );
}

function toAppwriteQueries(queries: McpQuery[]): string[] {
  return queries.map((query) => {
    switch (query.type) {
      case "equal":
        return Query.equal(query.field, query.value as string | string[] | number | boolean);
      case "notEqual":
        return Query.notEqual(query.field, query.value as string | number | boolean);
      case "isNull":
        return Query.isNull(query.field);
      case "greaterThanEqual":
        return Query.greaterThanEqual(query.field, query.value);
      case "lessThan":
        return Query.lessThan(query.field, query.value);
      case "limit":
        return Query.limit(query.value);
      case "cursorAfter":
        return Query.cursorAfter(query.value);
      case "orderDesc":
        return Query.orderDesc(query.field);
      case "orderAsc":
        return Query.orderAsc(query.field);
      default: {
        const _never: never = query;
        return _never;
      }
    }
  });
}

export function createAppwriteStore(databases: Databases, databaseId: string): McpStore {
  return {
    async get<T = Record<string, unknown>>(collection: string, id: string): Promise<T> {
      try {
        return (await databases.getDocument(databaseId, collection, id)) as T;
      } catch (error) {
        if (isAppwriteNotFound(error)) {
          throw notFoundError("Not found");
        }
        throw error;
      }
    },

    async list<T = Record<string, unknown>>(collection: string, queries: McpQuery[]) {
      const result = await databases.listDocuments(
        databaseId,
        collection,
        toAppwriteQueries(queries)
      );
      return {
        documents: result.documents as T[],
        total: result.total,
      };
    },

    async create<T = Record<string, unknown>>(
      collection: string,
      data: Record<string, unknown>,
      id?: string
    ): Promise<T> {
      return (await databases.createDocument(
        databaseId,
        collection,
        id || ID.unique(),
        data
      )) as T;
    },

    async update<T = Record<string, unknown>>(
      collection: string,
      id: string,
      data: Record<string, unknown>
    ): Promise<T> {
      return (await databases.updateDocument(databaseId, collection, id, data)) as T;
    },

    async delete(collection: string, id: string): Promise<void> {
      await databases.deleteDocument(databaseId, collection, id);
    },
  };
}
