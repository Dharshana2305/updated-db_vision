import { DatabaseSchema, TableSchema } from '../../src/types.js';
import { OllamaClient } from './OllamaClient.js';

export interface SchemaChunk {
  id: string;
  tableName: string;
  chunkType: 'table_overview' | 'column_detail' | 'foreign_keys' | 'indexes';
  content: string;
  vector?: number[];
  tfidfVector?: Map<string, number>;
}

export interface RetrievalResult {
  chunk: SchemaChunk;
  score: number;
}

export class VectorStore {
  private chunks: SchemaChunk[] = [];
  private vocabulary: Set<string> = new Set();

  /**
   * Chunks a normalized DatabaseSchema into granular documents and builds similarity index.
   */
  async buildIndex(schema: DatabaseSchema, options: { baseUrl?: string; embeddingModel?: string } = {}): Promise<number> {
    this.chunks = [];
    this.vocabulary.clear();

    // Chunk 0: Master Dataset Manifest & Table Inventory (Grounding Anchor)
    const tableInventory = schema.tables.map((t, idx) =>
      `${idx + 1}. Table "${t.name}" (${t.rowCount} rows, ${t.columns.length} columns, PK: [${t.primaryKey.join(', ') || 'None'}])`
    ).join('\n');
    const manifestText = `Authoritative Dataset Document Summary for database "${schema.databaseName}":
Total Number of Tables in Dataset: ${schema.tables.length}
Database Engine / Type: ${schema.databaseType}
Complete Inventory of All ${schema.tables.length} Tables in the Dataset:
${tableInventory}
Dataset Metrics: ${schema.tables.length} tables total, ${schema.summary.totalColumns} columns total, ${schema.summary.totalForeignKeys} foreign key relationships, ${schema.summary.totalEstimatedRows} estimated total records.`;

    this.addChunk({
      id: 'chk-dataset-manifest',
      tableName: '__dataset__',
      chunkType: 'table_overview',
      content: manifestText
    });

    for (const table of schema.tables) {
      // Chunk 1: Table Overview
      const pkStr = table.primaryKey.join(', ') || 'None';
      const overviewText = `Table "${table.name}" (${table.type}, ${table.rowCount} rows). Primary Key: ${pkStr}. Columns count: ${table.columns.length}.`;
      this.addChunk({
        id: `chk-${table.name}-overview`,
        tableName: table.name,
        chunkType: 'table_overview',
        content: overviewText
      });

      // Chunk 2: Detailed Column Attributes
      const colDetails = table.columns.map(c =>
        `Column "${c.name}" in table "${table.name}": type=${c.dataType}, nullable=${c.isNullable}, primaryKey=${c.isPrimaryKey}, foreignKey=${c.isForeignKey}, default=${c.defaultValue || 'none'}`
      ).join('\n');
      this.addChunk({
        id: `chk-${table.name}-columns`,
        tableName: table.name,
        chunkType: 'column_detail',
        content: `Table "${table.name}" Column Definitions:\n${colDetails}`
      });

      // Chunk 3: Foreign Keys & Relationships
      if (table.foreignKeys.length > 0) {
        const fkDetails = table.foreignKeys.map(f =>
          `Relationship: "${table.name}.${f.columnName}" references "${f.referencedTable}.${f.referencedColumn}" (onDelete: ${f.onDelete || 'NO ACTION'})`
        ).join('\n');
        this.addChunk({
          id: `chk-${table.name}-fks`,
          tableName: table.name,
          chunkType: 'foreign_keys',
          content: `Table "${table.name}" Foreign Key Constraints:\n${fkDetails}`
        });
      }

      // Chunk 4: Indexes & Performance Constraints
      if (table.indexes.length > 0) {
        const idxDetails = table.indexes.map(i =>
          `Index "${i.name}" on table "${table.name}": columns=[${i.columns.join(', ')}], unique=${i.isUnique}`
        ).join('\n');
        this.addChunk({
          id: `chk-${table.name}-indexes`,
          tableName: table.name,
          chunkType: 'indexes',
          content: `Table "${table.name}" Indexes:\n${idxDetails}`
        });
      }
    }

    // Build TF-IDF vectors for deterministic local fallback retrieval
    this.buildTfidfIndex();

    // Try embedding generation via Ollama only if service is reachable
    const baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = options.embeddingModel || process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

    try {
      const health = await OllamaClient.checkHealth(baseUrl);
      if (health.available) {
        for (const chunk of this.chunks) {
          const emb = await OllamaClient.generateEmbedding(chunk.content, { baseUrl, model });
          if (emb && emb.length > 0) {
            chunk.vector = emb;
          }
        }
      }
    } catch {
      // If embedding model fails, TF-IDF vector retrieval handles search smoothly
    }

    return this.chunks.length;
  }

  private addChunk(chunk: SchemaChunk) {
    this.chunks.push(chunk);
    const tokens = this.tokenize(chunk.content);
    tokens.forEach(t => this.vocabulary.add(t));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  private buildTfidfIndex() {
    const docCount = this.chunks.length;
    if (docCount === 0) return;

    // Calculate document frequency (DF)
    const dfMap = new Map<string, number>();
    for (const chunk of this.chunks) {
      const tokens = new Set(this.tokenize(chunk.content));
      tokens.forEach(t => {
        dfMap.set(t, (dfMap.get(t) || 0) + 1);
      });
    }

    // Calculate TF-IDF vectors
    for (const chunk of this.chunks) {
      const tokens = this.tokenize(chunk.content);
      const tfMap = new Map<string, number>();
      tokens.forEach(t => tfMap.set(t, (tfMap.get(t) || 0) + 1));

      const tfidfVector = new Map<string, number>();
      tfMap.forEach((tf, term) => {
        const df = dfMap.get(term) || 1;
        const idf = Math.log((docCount + 1) / (df + 1)) + 1;
        tfidfVector.set(term, tf * idf);
      });

      chunk.tfidfVector = tfidfVector;
    }
  }

  /**
   * Similarity search retrieving top-K relevant schema context chunks.
   */
  async retrieve(query: string, topK = 4, options: { baseUrl?: string; embeddingModel?: string } = {}): Promise<RetrievalResult[]> {
    if (this.chunks.length === 0) return [];

    const baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = options.embeddingModel || process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

    // Try dense vector search if embeddings exist
    try {
      const queryEmb = await OllamaClient.generateEmbedding(query, { baseUrl, model });
      if (queryEmb && queryEmb.length > 0 && this.chunks.some(c => c.vector && c.vector.length > 0)) {
        const results: RetrievalResult[] = [];
        for (const chunk of this.chunks) {
          if (chunk.vector) {
            const score = this.cosineSimilarity(queryEmb, chunk.vector);
            results.push({ chunk, score });
          }
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
      }
    } catch {
      // Fall through to TF-IDF
    }

    // TF-IDF cosine similarity search
    const queryTokens = this.tokenize(query);
    const queryTfMap = new Map<string, number>();
    queryTokens.forEach(t => queryTfMap.set(t, (queryTfMap.get(t) || 0) + 1));

    const results: RetrievalResult[] = [];

    for (const chunk of this.chunks) {
      if (!chunk.tfidfVector) continue;
      let dotProduct = 0;
      let queryMagnitude = 0;
      let chunkMagnitude = 0;

      queryTfMap.forEach((tf, term) => {
        queryMagnitude += tf * tf;
        const chunkWeight = chunk.tfidfVector!.get(term) || 0;
        dotProduct += tf * chunkWeight;
      });

      chunk.tfidfVector.forEach((weight) => {
        chunkMagnitude += weight * weight;
      });

      queryMagnitude = Math.sqrt(queryMagnitude);
      chunkMagnitude = Math.sqrt(chunkMagnitude);

      const score = (queryMagnitude > 0 && chunkMagnitude > 0) ? (dotProduct / (queryMagnitude * chunkMagnitude)) : 0;

      // Boost table name exact match
      let boost = 0;
      if (query.toLowerCase().includes(chunk.tableName.toLowerCase())) {
        boost += 0.3;
      }
      if (chunk.id === 'chk-dataset-manifest') {
        const isDatasetQuery = /how\s+many|count|tables?|dataset|database|entities|schema|summary|list/i.test(query);
        if (isDatasetQuery) {
          boost += 0.8;
        }
      }

      results.push({ chunk, score: score + boost });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }
}
