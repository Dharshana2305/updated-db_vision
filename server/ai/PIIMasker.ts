export interface MaskResult {
  maskedText: string;
  tokenMap: Record<string, string>; // [EMAIL_001] -> original
  redactionCount: number;
}

export class PIIMasker {
  private static emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private static phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  private static ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  private static creditCardRegex = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;

  /**
   * Scans text or structured objects and replaces PII tokens with safe placeholders
   * e.g. "john.doe@example.com" -> "[EMAIL_001]"
   */
  static mask(text: string): MaskResult {
    const tokenMap: Record<string, string> = {};
    let redactionCount = 0;

    let emailIdx = 1;
    let phoneIdx = 1;
    let ssnIdx = 1;
    let cardIdx = 1;

    let maskedText = text;

    // Mask Credit Cards
    maskedText = maskedText.replace(this.creditCardRegex, match => {
      const token = `[CREDIT_CARD_${String(cardIdx++).padStart(3, '0')}]`;
      tokenMap[token] = match;
      redactionCount++;
      return token;
    });

    // Mask SSN
    maskedText = maskedText.replace(this.ssnRegex, match => {
      const token = `[GOV_ID_${String(ssnIdx++).padStart(3, '0')}]`;
      tokenMap[token] = match;
      redactionCount++;
      return token;
    });

    // Mask Emails
    maskedText = maskedText.replace(this.emailRegex, match => {
      const token = `[EMAIL_${String(emailIdx++).padStart(3, '0')}]`;
      tokenMap[token] = match;
      redactionCount++;
      return token;
    });

    // Mask Phones
    maskedText = maskedText.replace(this.phoneRegex, match => {
      const token = `[PHONE_${String(phoneIdx++).padStart(3, '0')}]`;
      tokenMap[token] = match;
      redactionCount++;
      return token;
    });

    return { maskedText, tokenMap, redactionCount };
  }

  /**
   * Masks sensitive fields in a schema or sample row object
   */
  static maskObject(obj: any): any {
    if (!obj) return obj;
    const jsonStr = JSON.stringify(obj);
    const { maskedText } = this.mask(jsonStr);
    try {
      return JSON.parse(maskedText);
    } catch {
      return obj;
    }
  }
}
