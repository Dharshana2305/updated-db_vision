import { DatabaseSchema, Finding } from '../../src/types.js';

export class SecurityScanner {
  static scan(schema: DatabaseSchema): Finding[] {
    const findings: Finding[] = [];
    let findingIdx = 1;

    for (const table of schema.tables) {
      for (const col of table.columns) {
        const colLower = col.name.toLowerCase();

        // 1. Plaintext Password Detection
        if (
          colLower === 'pwd' ||
          colLower === 'password' ||
          colLower === 'pass' ||
          colLower === 'user_password' ||
          colLower === 'passwd'
        ) {
          findings.push({
            id: `SEC-PW-${table.name}-${col.name}`,
            title: `Potential Plaintext Password Column in "${table.name}"`,
            category: 'security',
            severity: 'CRITICAL',
            description: `The column "${col.name}" in table "${table.name}" strongly indicates password storage. If raw or weakly encrypted passwords are kept in the database, a single leak compromises all user accounts.`,
            evidence: `Column name matches sensitive credential pattern: "${col.name}" (${col.dataType})`,
            databaseObject: `${table.name}.${col.name}`,
            table: table.name,
            column: col.name,
            whyItMatters: 'Storing unhashed or unsalted credentials violates security compliance (OWASP Top 10, NIST SP 800-63B, ISO 27001). Passwords must always be hashed using strong one-way algorithms like Argon2id or bcrypt with random salt.',
            recommendation: `Migrate column to store salted crypt hashes (e.g. bcrypt $2b$ or Argon2) and rename to "${col.name}_hash".`,
            confidence: 96,
            risk: 'HIGH',
            expectedImpact: 'Eliminates credential exposure hazard during database breach or backup exposure.',
            suggestedFix: `-- Recommended SQL Migration
ALTER TABLE "${table.name}" ADD COLUMN "${col.name}_hash" VARCHAR(255);
-- 1. Batch hash existing values via application service
-- 2. Drop the plaintext column once migrated`,
            status: 'OPEN',
            safeToApplyAuto: false
          });
        }

        // 2. Credit Card / PCI-DSS Exposure
        if (
          colLower.includes('card_num') ||
          colLower.includes('credit_card') ||
          colLower === 'card_cvv' ||
          colLower === 'cvv' ||
          colLower === 'ccv' ||
          colLower === 'pan'
        ) {
          findings.push({
            id: `SEC-PCI-${table.name}-${col.name}`,
            title: `Direct Payment Card / CVV Storage in "${table.name}"`,
            category: 'security',
            severity: 'CRITICAL',
            description: `Column "${col.name}" appears to store primary account numbers (PAN) or card verification values (CVV). PCI-DSS Req 3.2 strictly prohibits storing CVV post-authorization under any circumstances.`,
            evidence: `Matches PCI prohibited field: "${col.name}"`,
            databaseObject: `${table.name}.${col.name}`,
            table: table.name,
            column: col.name,
            whyItMatters: 'Direct storage of raw credit card PAN and CVV numbers exposes the organization to catastrophic liability, regulatory fines, and payment network revocation.',
            recommendation: 'Replace raw payment storage with tokenized IDs from a certified payment processor (e.g. Stripe, Razorpay). Never persist CVV.',
            confidence: 98,
            risk: 'HIGH',
            expectedImpact: 'Achieves PCI-DSS compliance and protects customer financial assets.',
            suggestedFix: `-- Replace with payment processor token reference
ALTER TABLE "${table.name}" ADD COLUMN payment_token VARCHAR(100);
-- DROP the raw card number/CVV columns`,
            status: 'OPEN',
            safeToApplyAuto: false
          });
        }

        // 3. Government ID / Social Security Numbers (PII)
        if (
          colLower === 'ssn' ||
          colLower === 'national_id' ||
          colLower === 'national_id_number' ||
          colLower === 'aadhaar' ||
          colLower === 'sin' ||
          colLower === 'tax_id'
        ) {
          findings.push({
            id: `SEC-PII-${table.name}-${col.name}`,
            title: `Unencrypted Government Identity Number (PII) in "${table.name}"`,
            category: 'security',
            severity: 'HIGH',
            description: `Column "${col.name}" contains sensitive government identity records (SSN/National ID/Aadhaar). These identifiers must be protected with field-level encryption or pseudonymization.`,
            evidence: `Government identifier detected in schema: "${col.name}" (${col.dataType})`,
            databaseObject: `${table.name}.${col.name}`,
            table: table.name,
            column: col.name,
            whyItMatters: 'National identification numbers can facilitate identity theft, synthetic identity fraud, and severe regulatory penalties under GDPR/HIPAA/DPDP.',
            recommendation: 'Encrypt this column at rest using envelope encryption (AES-256-GCM) or tokenization.',
            confidence: 92,
            risk: 'HIGH',
            expectedImpact: 'Safeguards individual citizen privacy and satisfies data residency/privacy legislation.',
            suggestedFix: `-- Recommended: Mask or store last 4 digits only for display
ALTER TABLE "${table.name}" ADD COLUMN "${col.name}_last4" VARCHAR(4);`,
            status: 'OPEN',
            safeToApplyAuto: false
          });
        }

        // 4. Contact PII (Phone & Email) in Public Tables
        if (colLower === 'phone_number' || colLower === 'phone' || colLower === 'mobile') {
          findings.push({
            id: `SEC-PHONE-${table.name}-${col.name}`,
            title: `Direct Phone Number PII in "${table.name}"`,
            category: 'security',
            severity: 'LOW',
            description: `The column "${col.name}" stores direct telephone contact information. Ensure access control is enforced.`,
            evidence: `Contact PII column detected: "${col.name}"`,
            databaseObject: `${table.name}.${col.name}`,
            table: table.name,
            column: col.name,
            whyItMatters: 'Personal phone numbers should have strict read permissions to prevent scraping and spam harassment.',
            recommendation: 'Ensure queries selecting this column are audited and authenticated.',
            confidence: 90,
            risk: 'LOW',
            expectedImpact: 'Reduces surface area for data harvesting.',
            suggestedFix: `CREATE TABLE IF NOT EXISTS _security_policies (target_object TEXT PRIMARY KEY, classification TEXT, min_role TEXT, updated_at TEXT);
INSERT OR REPLACE INTO _security_policies VALUES ('${table.name}.${col.name}', 'RESTRICTED_PII', 'ROLE_ADMIN', datetime('now'));`,
            status: 'OPEN',
            safeToApplyAuto: true
          });
        }
      }
    }

    return findings;
  }
}
