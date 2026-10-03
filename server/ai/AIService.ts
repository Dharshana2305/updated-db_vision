import { DatabaseSchema, HealthScore, Finding, ChatMessage } from '../../src/types.js';
import { OllamaClient } from './OllamaClient.js';
import { GeminiClient } from './GeminiClient.js';
import { PIIMasker } from './PIIMasker.js';
import { VectorStore } from './VectorStore.js';
import { validateReadOnlySQL } from '../utils/sqlSecurity.js';
import { store } from '../db/store.js';

export interface ChatRequestOptions {
  projectId: string;
  userMessage: string;
  schema?: DatabaseSchema;
  healthScore?: HealthScore;
  findings?: Finding[];
  chatHistory?: ChatMessage[];
}

// In-memory vector store cache per project
const vectorStoreCache: Map<string, VectorStore> = new Map();

export class AIService {
  /**
   * Retrieves or builds RAG Vector Store index for project schema.
   */
  private static async getVectorStore(projectId: string, schema: DatabaseSchema): Promise<VectorStore> {
    let storeInstance = vectorStoreCache.get(projectId);
    if (!storeInstance) {
      storeInstance = new VectorStore();
      const settings = store.getSettings();
      await storeInstance.buildIndex(schema, {
        baseUrl: settings.ollamaBaseUrl
      });
      vectorStoreCache.set(projectId, storeInstance);
    }
    return storeInstance;
  }

  /**
   * Generates grounded summary of database architecture.
   */
  static async explainDatabase(schema: DatabaseSchema): Promise<{ explanation: string; provider: string }> {
    const settings = store.getSettings();
    const tableSummaries = schema.tables.map(t => {
      const pks = t.primaryKey.join(', ') || 'none';
      const fks = t.foreignKeys.map(f => `${f.columnName} -> ${f.referencedTable}`).join(', ') || 'none';
      const colNames = t.columns.map(c => `${c.name} (${c.dataType})`).join(', ');
      return `- Table "${t.name}" (${t.rowCount} rows): Columns: [${colNames}]; PK: [${pks}]; FKs: [${fks}]`;
    }).join('\n');

    const prompt = `Analyze this database schema and provide an executive and architectural explanation.
Database Name: ${schema.databaseName}
Type: ${schema.databaseType}
Total Tables: ${schema.tables.length}
Total Estimated Rows: ${schema.summary.totalEstimatedRows}

Tables and schema:
${tableSummaries}

Provide:
1. Executive Domain Summary
2. Core Business Entities and their purpose
3. Key workflows enabled by this model
4. Notable architectural strengths or areas of improvement.`;

    try {
      const ollamaHealth = await OllamaClient.checkHealth(settings.ollamaBaseUrl);
      if (ollamaHealth.available) {
        const res = await OllamaClient.generate(prompt, {
          baseUrl: settings.ollamaBaseUrl,
          model: settings.ollamaModel,
          system: 'You are an expert senior database architect.'
        });
        return { explanation: res.response, provider: `Ollama RAG (${settings.ollamaModel})` };
      }
    } catch {
      // Fall through
    }

    if (GeminiClient.isAvailable()) {
      try {
        const text = await GeminiClient.generate(prompt);
        return { explanation: text, provider: 'Gemini 2.5 Flash' };
      } catch {
        // Fall through
      }
    }

    // Deterministic Rule Engine
    const tableCount = schema.tables.length;
    const tableNames = schema.tables.map(t => t.name);

    let domain = 'General Relational Information System';
    if (tableNames.some(n => n.includes('order') || n.includes('product') || n.includes('cart'))) {
      domain = 'E-Commerce & Digital Merchandising Platform';
    } else if (tableNames.some(n => n.includes('patient') || n.includes('doctor') || n.includes('appointment'))) {
      domain = 'Healthcare Clinic & Electronic Health Records System';
    }

    const text = `### Domain Assessment: ${domain}
This database is structured as a **${schema.databaseType.toUpperCase()}** schema named **"${schema.databaseName}"**, consisting of **${tableCount} tables** spanning **${schema.summary.totalColumns} columns** and **${schema.summary.totalEstimatedRows} total records**.

#### Core Entity Breakdown:
${schema.tables.map(t => `- **\`${t.name}\`** (${t.rowCount} rows): Primary key \`${t.primaryKey.join(', ') || 'None'}\` with ${t.columns.length} columns and ${t.foreignKeys.length} foreign key relationships.`).join('\n')}

#### Architectural Observations:
- **Relational Constraints**: Contains ${schema.summary.totalForeignKeys} foreign keys.
- **Indexes**: ${schema.summary.totalIndexes} active secondary indexes.`;

    return { explanation: text, provider: 'Deterministic Rule Engine' };
  }

  /**
   * Evaluates if a query is within the scope of the loaded database dataset
   * or beyond the dataset boundaries.
   */
  public static isQueryBeyondDataset(
    query: string,
    schema?: DatabaseSchema
  ): { isBeyond: boolean; matchedTables: string[]; reason?: string } {
    if (!schema || schema.tables.length === 0) {
      return { isBeyond: true, matchedTables: [], reason: 'No database dataset is currently connected.' };
    }

    const lower = query.toLowerCase().trim();

    // 1. Check for obvious general world trivia, pop culture, recipes, or non-database tasks
    const generalTriviaPatterns = [
      /\b(capital of|president of|prime minister|weather in|temperature in|forecast|recipe for|how to cook|how to bake)\b/i,
      /\b(tell me a joke|write a poem|write a song|write a story|sing a song|who won the|super bowl|world cup|olympics)\b/i,
      /\b(who is the president|who is elon musk|who is donald trump|who is barack obama|who is taylor swift)\b/i,
      /\b(translate (this|to)|french translation|spanish translation|german translation)\b/i,
      /\b(horoscope|zodiac sign|astrology|quantum physics|black hole theory|general relativity)\b/i,
      /\b(movie recommendations?|top netflix movies?|video games? to play)\b/i,
      /\b(crypto prices?|bitcoin price today|ethereum forecast|stock market today)\b/i
    ];

    for (const pat of generalTriviaPatterns) {
      if (pat.test(lower)) {
        return {
          isBeyond: true,
          matchedTables: [],
          reason: 'The inquiry is asking for general world trivia, entertainment, or non-database knowledge.'
        };
      }
    }

    // 2. Extract schema vocabulary: all table names, singular variants, and columns
    const schemaTableNames = new Set(schema.tables.map(t => t.name.toLowerCase()));
    const schemaSingularTables = new Set(
      schema.tables
        .map(t => t.name.toLowerCase())
        .map(n => n.endsWith('ies') ? n.slice(0, -3) + 'y' : n.endsWith('s') ? n.slice(0, -1) : n)
    );
    const schemaColumnNames = new Set(
      schema.tables.flatMap(t => t.columns.map(c => c.name.toLowerCase()))
    );

    // Identify which actual tables/columns from this dataset are mentioned
    const matchedTables = schema.tables.filter(t => {
      const tName = t.name.toLowerCase();
      const sing = tName.endsWith('ies') ? tName.slice(0, -3) + 'y' : tName.endsWith('s') ? tName.slice(0, -1) : tName;
      const regexTable = new RegExp(`\\b${tName}\\b`, 'i');
      const regexSing = new RegExp(`\\b${sing}\\b`, 'i');
      return regexTable.test(lower) || regexSing.test(lower);
    }).map(t => t.name);

    const matchedColumns = Array.from(schemaColumnNames).filter(col => {
      if (col.length <= 2) return false;
      const reg = new RegExp(`\\b${col}\\b`, 'i');
      return reg.test(lower);
    });

    // 3. Database meta/architectural queries are inherently within dataset scope
    const isDatabaseMetaQuery =
      /\b(table|tables|column|columns|schema|database|dataset|row|rows|record|records|index|indexes|foreign key|foreign keys|primary key|pk|fk|relationship|relations|health|score|audit|finding|findings|security|pii|vulnerability|explain|architecture|normalization|1nf|2nf|3nf|bcnf|query|queries|sql|select|count|overview|manifest|join|join|where|group by)\b/i.test(lower);

    // If query mentions known tables, known columns, or is a database meta query
    if (matchedTables.length > 0 || matchedColumns.length > 0 || isDatabaseMetaQuery) {
      // Check for foreign entities that clearly do NOT exist in this specific dataset
      const foreignEntityPatterns = [
        { term: 'flight', domain: 'aviation/flights' },
        { term: 'airplane', domain: 'aviation' },
        { term: 'airline', domain: 'aviation' },
        { term: 'airport', domain: 'aviation' },
        { term: 'hotel', domain: 'hospitality' },
        { term: 'crypto', domain: 'cryptocurrency' },
        { term: 'bitcoin', domain: 'cryptocurrency' },
        { term: 'ethereum', domain: 'cryptocurrency' },
        { term: 'student', domain: 'academics/school' },
        { term: 'course', domain: 'academics/school' },
        { term: 'grade', domain: 'academics/school' },
        { term: 'professor', domain: 'academics/school' },
        { term: 'movie', domain: 'cinema/entertainment' },
        { term: 'vehicle', domain: 'automotive' },
        { term: 'car', domain: 'automotive' }
      ];

      for (const fe of foreignEntityPatterns) {
        const regex = new RegExp(`\\b${fe.term}s?\\b`, 'i');
        if (regex.test(lower)) {
          const existsInSchema =
            schemaTableNames.has(fe.term) ||
            schemaSingularTables.has(fe.term) ||
            Array.from(schemaTableNames).some(t => t.includes(fe.term)) ||
            schemaColumnNames.has(fe.term);

          if (!existsInSchema && matchedTables.length === 0) {
            return {
              isBeyond: true,
              matchedTables: [],
              reason: `The query references "${fe.term}" (${fe.domain}) which is not part of this dataset.`
            };
          }
        }
      }

      return { isBeyond: false, matchedTables };
    }

    // If the query does not mention any tables, columns, or database concepts:
    return {
      isBeyond: true,
      matchedTables: [],
      reason: 'The inquiry is not related to any tables, columns, or queries in this database dataset.'
    };
  }

  /**
   * Generates a clear, professional refusal when a question is beyond the dataset.
   */
  private static generateDatasetRefusal(query: string, schema?: DatabaseSchema, reason?: string): string {
    if (!schema || schema.tables.length === 0) {
      return `### ⚠️ Question Not Based on Dataset

This question is not based on the loaded dataset because no active database is currently connected to this workspace.

Please connect a database or load a pre-configured sample database from the **Connection** tab to enable dataset-grounded analysis.`;
    }

    const tableList = schema.tables.map(t => `- **\`${t.name}\`** (${t.columns.length} columns, ${t.rowCount.toLocaleString()} records)`).join('\n');

    return `### ⚠️ Question Beyond Dataset Limits

This question is **not based on the loaded dataset**.

The active database **"${schema.databaseName}"** (${schema.databaseType.toUpperCase()}) only contains schema definitions and records for the following **${schema.tables.length} tables**:
${tableList}

${reason ? `*Note: ${reason}*\n\n` : ''}As an AI Database Copilot with strict dataset boundaries, I can only answer questions, explain schemas, and generate SQL queries that are directly grounded in this active database.

**Questions you can ask based on this dataset:**
- *"How many tables in the dataset?"*
- *"Show columns and types in \`${schema.tables[0]?.name || 'table'}\`"*
- *"What are the foreign key relationships?"*
- *"Explain the database architecture and entities"*
- *"Why is my health score low?"*
- *"Show top 5 records from \`${schema.tables[0]?.name || 'table'}\`"*`;
  }

  /**
   * Processes AI assistant queries using LangChain-style Conversational Retrieval Chain with multi-turn history.
   */
  static async chat(options: ChatRequestOptions): Promise<ChatMessage> {
    const { projectId, userMessage, schema, healthScore, findings, chatHistory } = options;
    const settings = store.getSettings();

    // 0. Dataset Scope Boundary Check:
    // If user question is beyond the dataset, immediately return a strict boundary refusal
    const boundaryCheck = this.isQueryBeyondDataset(userMessage, schema);
    if (boundaryCheck.isBeyond) {
      const refusalContent = this.generateDatasetRefusal(userMessage, schema, boundaryCheck.reason);
      return {
        id: `MSG-${Date.now()}`,
        role: 'assistant',
        content: refusalContent,
        timestamp: new Date().toISOString()
      };
    }

    let processedMessage = userMessage;
    if (settings.maskPIIBeforeAI) {
      processedMessage = PIIMasker.mask(userMessage).maskedText;
    }

    // 1. Vector Store Document Retrieval
    let ragContextText = 'No schema uploaded.';
    let retrievedChunks: string[] = [];

    if (schema && schema.tables.length > 0) {
      try {
        const vStore = await this.getVectorStore(projectId, schema);
        const results = await vStore.retrieve(processedMessage, 6, {
          baseUrl: settings.ollamaBaseUrl
        });

        retrievedChunks = results.map(r => `[Document Section: ${r.chunk.chunkType} (${r.chunk.tableName})] ${r.chunk.content}`);
        ragContextText = retrievedChunks.join('\n\n');
      } catch (err) {
        console.warn('RAG retrieval fallback:', err);
      }
    }

    // 2. Authoritative Dataset Document & Table Inventory (Grounding Anchor)
    const tableManifest = schema ? schema.tables.map((t, idx) =>
      `${idx + 1}. Table "${t.name}" — Estimated Rows: ${t.rowCount}, Columns: ${t.columns.length}, Primary Key: [${t.primaryKey.join(', ') || 'None'}], Foreign Keys: [${t.foreignKeys.map(f => `${f.columnName} -> ${f.referencedTable}.${f.referencedColumn}`).join(', ') || 'None'}]`
    ).join('\n') : 'No schema loaded.';

    const authoritativeDocument = schema ? `
[AUTHORITATIVE DATASET DOCUMENT]
Dataset / Database Name: "${schema.databaseName}"
Database Type / Dialect: ${schema.databaseType}
Total Number of Tables in Dataset: ${schema.tables.length}
Total Columns Across Dataset: ${schema.summary.totalColumns}
Total Foreign Key Relationships: ${schema.summary.totalForeignKeys}
Total Indexes: ${schema.summary.totalIndexes}
Total Estimated Rows: ${schema.summary.totalEstimatedRows}

COMPLETE TABLE INVENTORY (${schema.tables.length} TABLES):
${tableManifest}

RELEVANT DETAILED SCHEMA FRAGMENTS (RETRIEVED VIA VECTOR / TF-IDF):
${ragContextText}
[/AUTHORITATIVE DATASET DOCUMENT]` : 'No schema loaded.';

    const healthSummary = healthScore
      ? `Audit Health Score: ${healthScore.overall}/100 (Structure: ${healthScore.categories.structure}, Security: ${healthScore.categories.security}, Performance: ${healthScore.categories.performance}, Quality: ${healthScore.categories.dataQuality})`
      : 'Health score not evaluated yet.';

    const topFindings = (findings || []).slice(0, 5).map(f => `- [${f.severity}] ${f.title} on ${f.table}${f.column ? `.${f.column}` : ''}: ${f.description}`).join('\n');

    // 3. LangChain Conversational History Formatting
    const conversationHistory = (chatHistory || [])
      .filter(m => m.content && m.content.trim() && m.content !== processedMessage)
      .slice(-6)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

    const systemInstruction = `You are an expert senior Database Intelligence Copilot operating with strict dataset boundaries.
You have authoritative access to the Dataset Document and the ongoing conversation history.

CRITICAL OPERATIONAL RULES:
1. STRICT DATASET GROUNDING: Base every single answer directly and exclusively on the provided Dataset Document for database "${schema?.databaseName || 'active'}". Do NOT answer in generic textbook generalities or "normal terms". Always cite the actual table names, column names, keys, and row counts from the document.
2. REFUSAL FOR QUESTIONS BEYOND DATASET:
   If the user asks about world trivia, pop culture, recipes, sports, weather, or topics/entities/tables not present in this dataset (e.g. asking for flights when this is healthcare):
   You MUST refuse to answer and explicitly state:
   "This question is not based on the loaded dataset. The active database \\"${schema?.databaseName}\\" only contains tables: [list tables]. I can only answer questions directly based on this database dataset."
3. QUANTITATIVE & STRUCTURAL SPECIFICITY:
   - When asked "how many tables in the dataset" (or variations like "table count", "what tables exist", "list tables"):
     * You MUST explicitly specify the EXACT count (e.g. "There are exactly ${schema?.tables.length || 0} tables in this dataset:").
     * You MUST enumerate all ${schema?.tables.length || 0} tables by name with their row counts, column counts, and key primary keys.
   - When asked about columns, types, keys, or relationships, specify the exact attributes defined in the document.
4. CONVERSATIONAL MEMORY: Maintain continuity with the prior conversation history. If the user refers to "that table", "the previous query", "the foreign key", or follow-up questions, resolve them using history and the dataset document.
5. SAFE READ-ONLY SQL: If providing SQL, write only read-only queries referencing real tables and columns from the document, wrapped in \`\`\`sql ... \`\`\`.`;

    const userPromptWithContext = `${authoritativeDocument}

System Status:
${healthSummary}
Audit Findings:
${topFindings || 'No critical issues recorded.'}

User Question: "${processedMessage}"`;

    let assistantResponse = '';
    let aiProvider = 'LangChain RAG';

    // Model Execution 1: Gemini Flash with Conversation History & Fallback
    if (GeminiClient.isAvailable()) {
      try {
        assistantResponse = await GeminiClient.chatWithHistory({
          prompt: userPromptWithContext,
          systemInstruction,
          history: conversationHistory
        });
        aiProvider = 'Gemini Flash (Grounding RAG)';
      } catch (err: any) {
        console.warn('[AIService] Gemini cloud call failed or rate-limited, switching to deterministic engine:', err?.message || err);
      }
    }

    // Model Execution 2: Local Ollama
    if (!assistantResponse) {
      try {
        const health = await OllamaClient.checkHealth(settings.ollamaBaseUrl);
        if (health.available) {
          const res = await OllamaClient.generate(`${systemInstruction}\n\n${userPromptWithContext}`, {
            baseUrl: settings.ollamaBaseUrl,
            model: settings.ollamaModel,
            system: systemInstruction
          });
          assistantResponse = res.response;
          aiProvider = `Ollama LangChain (${settings.ollamaModel})`;
        }
      } catch {
        // Fall through
      }
    }

    // Model Execution 3: Deterministic Document-Grounded LangChain Engine
    if (!assistantResponse) {
      assistantResponse = this.generateDeterministicResponse(userMessage, schema, healthScore, findings, conversationHistory);
      aiProvider = 'Deterministic Grounded Engine';
    }

    // Extract & Validate SQL if presented by AI
    let sqlGenerated: ChatMessage['sqlGenerated'] | undefined;
    const sqlMatch = assistantResponse.match(/```sql([\s\S]*?)```/i);

    if (sqlMatch && sqlMatch[1]) {
      const rawSql = sqlMatch[1].trim();
      const validation = validateReadOnlySQL(rawSql);

      // Validate that SQL references real tables in schema if schema exists
      let schemaValidationPassed = true;
      let schemaMessage = '';

      if (schema && schema.tables.length > 0) {
        const existingTableNames = new Set(schema.tables.map(t => t.name.toLowerCase()));
        const words = rawSql.toLowerCase().split(/[\s,()";]+/);
        const referencedTables = words.filter(w => existingTableNames.has(w));

        if (referencedTables.length === 0) {
          schemaValidationPassed = false;
          schemaMessage = 'Generated SQL references non-existent database objects.';
        }
      }

      sqlGenerated = {
        query: rawSql,
        explanation: schemaValidationPassed
          ? 'Generated from schema document analysis. Click "Approve & Execute" to run this read-only query.'
          : `Warning: ${schemaMessage || 'Please inspect query before executing.'}`,
        requiresApproval: true,
        isReadOnly: validation.isReadOnly,
        isDestructive: !validation.isSafe
      };
    }

    return {
      id: `MSG-${Date.now()}`,
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date().toISOString(),
      sqlGenerated
    };
  }

  /**
   * Deterministic, document-grounded LangChain fallback engine that strictly answers
   * questions based on the dataset document without generic terms.
   */
  private static generateDeterministicResponse(
    msg: string,
    schema?: DatabaseSchema,
    healthScore?: HealthScore,
    findings?: Finding[],
    history?: { role: string; content: string }[]
  ): string {
    const lower = msg.toLowerCase();

    if (!schema || schema.tables.length === 0) {
      return `### Dataset Document Status
No active database schema is currently loaded for this project. Please connect a database or load a pre-configured sample database from the **Connection** tab to enable document-grounded analysis.`;
    }

    // 1. Table Count / Table List Question ("how many tables in the dataset", "what tables exist", "table count", etc.)
    const isTableCountQuery =
      /how\s+many\s+tables|how\s+many\s+table|number\s+of\s+tables|table\s+count|count.*table|tables?\s+in\s+(the\s+)?(dataset|database)|what\s+tables|list\s+(all\s+)?tables|show\s+(all\s+)?tables|all\s+tables/i.test(lower);

    if (isTableCountQuery) {
      const tableRows = schema.tables.map((t, idx) =>
        `| ${idx + 1} | **\`${t.name}\`** | ${t.rowCount.toLocaleString()} | ${t.columns.length} | \`${t.primaryKey.join(', ') || 'None'}\` | ${t.foreignKeys.length} |`
      ).join('\n');

      return `### Dataset Table Specification: **"${schema.databaseName}"**

Based on the authoritative dataset document, there are exactly **${schema.tables.length} tables** in this dataset:

| # | Table Name | Estimated Rows | Columns | Primary Key | Foreign Keys |
|---|---|---|---|---|---|
${tableRows}

**Dataset Metrics Summary:**
- **Total Tables**: ${schema.tables.length}
- **Total Columns**: ${schema.summary.totalColumns}
- **Total Foreign Key Relationships**: ${schema.summary.totalForeignKeys}
- **Total Secondary Indexes**: ${schema.summary.totalIndexes}
- **Total Estimated Records**: ${schema.summary.totalEstimatedRows.toLocaleString()}
- **Database Engine**: ${schema.databaseType.toUpperCase()}

You can ask me to inspect the columns of any table (e.g. *"Show columns in ${schema.tables[0]?.name || 'table'}"*) or generate a read-only query.`;
    }

    // 2. Specific Table Column or Schema Lookup (e.g. "columns of users", "what columns in products", "describe orders")
    const matchedTable = schema.tables.find(t =>
      new RegExp(`\\b${t.name}\\b`, 'i').test(lower) ||
      (t.name.endsWith('s') && new RegExp(`\\b${t.name.slice(0, -1)}\\b`, 'i').test(lower))
    );

    if (matchedTable && (lower.includes('column') || lower.includes('describe') || lower.includes('schema') || lower.includes('fields') || lower.includes('structure') || lower.includes('what is in'))) {
      const colRows = matchedTable.columns.map((c, idx) => {
        const pkBadge = c.isPrimaryKey ? '🔑 PK' : '';
        const fkBadge = c.isForeignKey ? '🔗 FK' : '';
        const flags = [pkBadge, fkBadge].filter(Boolean).join(' ') || '-';
        return `| ${idx + 1} | **\`${c.name}\`** | \`${c.dataType}\` | ${c.isNullable ? 'Yes' : 'No'} | ${flags} | ${c.defaultValue || 'None'} |`;
      }).join('\n');

      const fks = matchedTable.foreignKeys.length > 0
        ? `\n**Foreign Key Relationships:**\n` + matchedTable.foreignKeys.map(f => `- \`${matchedTable.name}.${f.columnName}\` ➔ \`${f.referencedTable}.${f.referencedColumn}\` (ON DELETE: ${f.onDelete || 'NO ACTION'})`).join('\n')
        : '\n**Foreign Key Relationships:** None';

      return `### Table Specification: **\`${matchedTable.name}\`** (from dataset "${schema.databaseName}")

- **Type**: \`${matchedTable.type}\`
- **Total Columns**: ${matchedTable.columns.length}
- **Estimated Row Count**: ${matchedTable.rowCount.toLocaleString()}
- **Primary Key**: \`${matchedTable.primaryKey.join(', ') || 'None'}\`

| # | Column Name | Data Type | Nullable | Keys | Default |
|---|---|---|---|---|---|
${colRows}
${fks}

**Safe Read-Only Query Preview:**
\`\`\`sql
SELECT * FROM "${matchedTable.name}" LIMIT 10;
\`\`\`
Click **"Approve & Execute"** below to run this query securely.`;
    }

    // 3. Relationships / Foreign Keys Query ("foreign keys", "relationships", "relations")
    if (lower.includes('foreign key') || lower.includes('relationship') || lower.includes('relations') || lower.includes('references')) {
      const allFks = schema.tables.flatMap(t => t.foreignKeys.map(f => ({
        sourceTable: t.name,
        sourceCol: f.columnName,
        targetTable: f.referencedTable,
        targetCol: f.referencedColumn,
        onDelete: f.onDelete
      })));

      if (allFks.length === 0) {
        return `### Foreign Key Relationships in **"${schema.databaseName}"**
There are **no explicit foreign key constraints** defined across the ${schema.tables.length} tables in this dataset document. This is an architectural integrity risk where orphan records can accumulate.`;
      }

      const fkRows = allFks.map((f, idx) =>
        `| ${idx + 1} | **\`${f.sourceTable}.${f.sourceCol}\`** | ➔ | **\`${f.targetTable}.${f.targetCol}\`** | ${f.onDelete || 'NO ACTION'} |`
      ).join('\n');

      return `### Foreign Key Relationships in **"${schema.databaseName}"**

There are **${allFks.length} foreign key relationships** defined across the dataset:

| # | Source Column | | Referenced Column | On Delete |
|---|---|---|---|---|
${fkRows}

These relationships ensure referential integrity between parent and child entities in your schema.`;
    }

    // 4. Row Counts Query ("how many rows", "row count", "records")
    if (lower.includes('row') || lower.includes('record') || lower.includes('size')) {
      const rowList = schema.tables.map((t, idx) =>
        `- **\`${t.name}\`**: ${t.rowCount.toLocaleString()} rows (${t.columns.length} columns)`
      ).join('\n');

      return `### Record Counts Across Dataset **"${schema.databaseName}"**

Total estimated records across all **${schema.tables.length} tables**: **${schema.summary.totalEstimatedRows.toLocaleString()} rows**.

**Table-by-Table Breakdown:**
${rowList}

The largest table is **\`${[...schema.tables].sort((a, b) => b.rowCount - a.rowCount)[0]?.name || 'none'}\`**.`;
    }

    // 5. Health Score Query
    if (lower.includes('health') || lower.includes('score')) {
      if (!healthScore) {
        return `### Health Audit Status for **"${schema.databaseName}"**
A comprehensive health audit has not been generated yet for this project. Please click **"Run Audit Review"** on the Dashboard or Review page to compute deterministic scores across Security, Performance, Structure, and Data Quality.`;
      }
      return `### Database Health Assessment: **${healthScore.overall}/100** (Grade: ${healthScore.grade || 'N/A'})

**Category Breakdown:**
- **Structure & Design**: ${healthScore.categories.structure}/100
- **Security & PII**: ${healthScore.categories.security}/100
- **Query Performance**: ${healthScore.categories.performance}/100
- **Data Quality**: ${healthScore.categories.dataQuality}/100
- **Relationships**: ${healthScore.categories.relationships}/100
- **Maintainability**: ${healthScore.categories.maintainability}/100

**Audit Summary:**
${healthScore.explanation}`;
    }

    // 6. Security / Findings Query ("security", "findings", "issues", "vulnerabilities", "critical")
    if (lower.includes('security') || lower.includes('finding') || lower.includes('issue') || lower.includes('vulnerability') || lower.includes('problem')) {
      if (!findings || findings.length === 0) {
        return `### Audit Findings for **"${schema.databaseName}"**
No unresolved security or performance issues are currently flagged for this database.`;
      }

      const findingsList = findings.slice(0, 5).map((f, idx) =>
        `${idx + 1}. **[${f.severity}] ${f.title}** on \`${f.table}${f.column ? `.${f.column}` : ''}\`: ${f.description}\n   *Remedy*: ${f.recommendation}`
      ).join('\n\n');

      return `### Audit Review Findings for **"${schema.databaseName}"** (${findings.length} total issues):

${findingsList}

You can approve automated fixes or review rollback scripts in the **Recommendations** tab.`;
    }

    // 7. General Architecture Explanation
    if (lower.includes('explain') || lower.includes('architecture') || lower.includes('overview') || lower.includes('domain')) {
      const tableList = schema.tables.map(t => `- **\`${t.name}\`** (${t.rowCount} rows): PK \`${t.primaryKey.join(', ') || 'None'}\`, ${t.columns.length} columns`).join('\n');
      return `### Architecture Assessment: **"${schema.databaseName}"**

This database runs on **${schema.databaseType.toUpperCase()}** and comprises **${schema.tables.length} tables** with **${schema.summary.totalColumns} total columns** and **${schema.summary.totalForeignKeys} relational links**.

**Core Entities:**
${tableList}

**Summary:**
- Secondary Indexes: ${schema.summary.totalIndexes}
- Total Records: ${schema.summary.totalEstimatedRows.toLocaleString()}

Ask me to inspect any table or run read-only queries!`;
    }

    // 8. Default fallback: Grounded table preview (never generic normal terms)
    const firstTable = schema.tables[0];
    const tableNames = schema.tables.map(t => `\`${t.name}\``).join(', ');

    return `### Document-Grounded Context: **"${schema.databaseName}"**

This dataset contains **${schema.tables.length} tables**: ${tableNames}.

Here is a safe preview query for the first entity (**\`${firstTable.name}\`**):

\`\`\`sql
SELECT * FROM "${firstTable.name}" LIMIT 10;
\`\`\`

You can ask me questions like:
- *"How many tables in the dataset?"*
- *"Show columns in ${firstTable.name}"*
- *"What are the foreign key relationships?"*
- *"Why is my health score low?"*`;
  }
}
