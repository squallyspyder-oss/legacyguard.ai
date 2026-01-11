/**
 * Sanitização de PII (Personally Identifiable Information) em logs
 * 
 * Esta biblioteca detecta e sanitiza dados sensíveis antes de enviar ao LLM:
 * - CPF, CNPJ
 * - Emails
 * - Telefones
 * - Cartões de crédito
 * - IPs
 * - Tokens/API Keys
 * - Senhas em URLs
 * - Nomes de usuário em caminhos
 */

export type PIIType = 
  | 'cpf'
  | 'cnpj'
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ip_address'
  | 'api_key'
  | 'jwt_token'
  | 'password_in_url'
  | 'bearer_token'
  | 'aws_key'
  | 'github_token'
  | 'generic_secret';

export interface PIIMatch {
  type: PIIType;
  original: string;
  replacement: string;
  startIndex: number;
  endIndex: number;
}

export interface SanitizationResult {
  sanitized: string;
  piiDetected: boolean;
  piiTypes: PIIType[];
  matches: PIIMatch[];
  originalLength: number;
  sanitizedLength: number;
}

// Padrões de regex para detecção de PII
const PII_PATTERNS: Record<PIIType, { regex: RegExp; replacement: string }> = {
  // CPF: 000.000.000-00 ou 00000000000
  cpf: {
    regex: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b/g,
    replacement: '[CPF_REDACTED]',
  },
  
  // CNPJ: 00.000.000/0000-00 ou 00000000000000
  cnpj: {
    regex: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/.\s]?\d{4}[-.\s]?\d{2}\b/g,
    replacement: '[CNPJ_REDACTED]',
  },
  
  // Email
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
  },
  
  // Telefone brasileiro: (00) 00000-0000, (00) 0000-0000, +55...
  phone: {
    regex: /(?:\+55\s?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
  
  // Cartão de crédito: 0000 0000 0000 0000 ou 0000-0000-0000-0000
  credit_card: {
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CREDIT_CARD_REDACTED]',
  },
  
  // Endereço IP (v4)
  ip_address: {
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replacement: '[IP_REDACTED]',
  },
  
  // API Keys genéricas (padrão comum: 32+ caracteres alfanuméricos)
  api_key: {
    regex: /\b(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)[=:\s]["']?([A-Za-z0-9_-]{20,})["']?/gi,
    replacement: '[API_KEY_REDACTED]',
  },
  
  // JWT Tokens
  jwt_token: {
    regex: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    replacement: '[JWT_REDACTED]',
  },
  
  // Senhas em URLs: password=xxx, pwd=xxx, passwd=xxx
  password_in_url: {
    regex: /(?:password|passwd|pwd|secret|token)[=:]["']?[^&\s"']{3,}["']?/gi,
    replacement: '[PASSWORD_REDACTED]',
  },
  
  // Bearer tokens
  bearer_token: {
    regex: /\bBearer\s+[A-Za-z0-9_-]{20,}\b/gi,
    replacement: 'Bearer [TOKEN_REDACTED]',
  },
  
  // AWS Access Key ID
  aws_key: {
    regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[AWS_KEY_REDACTED]',
  },
  
  // GitHub tokens
  github_token: {
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    replacement: '[GITHUB_TOKEN_REDACTED]',
  },
  
  // Segredos genéricos (chaves longas que parecem secrets)
  generic_secret: {
    regex: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    replacement: '[SECRET_REDACTED]',
  },
};

// Ordem de processamento (mais específicos primeiro)
const PROCESSING_ORDER: PIIType[] = [
  'jwt_token',
  'bearer_token',
  'aws_key',
  'github_token',
  'api_key',
  'password_in_url',
  'credit_card',
  'cpf',
  'cnpj',
  'email',
  'phone',
  'ip_address',
  // generic_secret por último (mais falsos positivos)
];

/**
 * Sanitiza texto removendo PII
 */
export function sanitizePII(
  text: string,
  options: {
    enabledTypes?: PIIType[];
    preservePartial?: boolean; // Se true, mantém parte do dado (ex: ***@email.com)
    customPatterns?: Record<string, { regex: RegExp; replacement: string }>;
  } = {}
): SanitizationResult {
  const {
    enabledTypes = PROCESSING_ORDER,
    preservePartial = false,
    customPatterns = {},
  } = options;

  let sanitized = text;
  const matches: PIIMatch[] = [];
  const piiTypesFound = new Set<PIIType>();

  // Processar padrões customizados primeiro
  for (const [name, pattern] of Object.entries(customPatterns)) {
    const customMatches = text.matchAll(pattern.regex);
    for (const match of customMatches) {
      if (match.index !== undefined) {
        matches.push({
          type: 'generic_secret',
          original: match[0],
          replacement: pattern.replacement,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }
    sanitized = sanitized.replace(pattern.regex, pattern.replacement);
  }

  // Processar padrões built-in
  for (const piiType of enabledTypes) {
    if (piiType === 'generic_secret' && enabledTypes.length > 1) {
      // Pular generic_secret se outros tipos estão habilitados (muitos falsos positivos)
      continue;
    }

    const pattern = PII_PATTERNS[piiType];
    if (!pattern) continue;

    const typeMatches = [...sanitized.matchAll(pattern.regex)];
    
    for (const match of typeMatches) {
      if (match.index !== undefined) {
        let replacement = pattern.replacement;
        
        // Preservar parcialmente se solicitado
        if (preservePartial && match[0].length > 8) {
          const visible = match[0].slice(-4);
          replacement = `[${piiType.toUpperCase()}...${visible}]`;
        }

        matches.push({
          type: piiType,
          original: match[0],
          replacement,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
        
        piiTypesFound.add(piiType);
      }
    }

    sanitized = sanitized.replace(pattern.regex, pattern.replacement);
  }

  return {
    sanitized,
    piiDetected: matches.length > 0,
    piiTypes: Array.from(piiTypesFound),
    matches,
    originalLength: text.length,
    sanitizedLength: sanitized.length,
  };
}

/**
 * Verifica se texto contém PII (sem sanitizar)
 */
export function detectPII(text: string): {
  hasPII: boolean;
  types: PIIType[];
  count: number;
} {
  const typesFound = new Set<PIIType>();
  let count = 0;

  for (const piiType of PROCESSING_ORDER) {
    const pattern = PII_PATTERNS[piiType];
    if (!pattern) continue;

    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      typesFound.add(piiType);
      count += matches.length;
    }
  }

  return {
    hasPII: typesFound.size > 0,
    types: Array.from(typesFound),
    count,
  };
}

/**
 * Sanitiza logs em batch (array de linhas)
 */
export function sanitizeLogLines(
  lines: string[],
  options?: Parameters<typeof sanitizePII>[1]
): {
  lines: string[];
  totalPIIDetected: number;
  piiTypes: PIIType[];
} {
  const allTypes = new Set<PIIType>();
  let totalPII = 0;

  const sanitizedLines = lines.map(line => {
    const result = sanitizePII(line, options);
    result.piiTypes.forEach(t => allTypes.add(t));
    totalPII += result.matches.length;
    return result.sanitized;
  });

  return {
    lines: sanitizedLines,
    totalPIIDetected: totalPII,
    piiTypes: Array.from(allTypes),
  };
}

/**
 * Sanitiza objeto JSON recursivamente
 */
export function sanitizeJSON(
  obj: unknown,
  options?: Parameters<typeof sanitizePII>[1]
): { sanitized: unknown; piiDetected: boolean; piiTypes: PIIType[] } {
  const allTypes = new Set<PIIType>();
  let piiFound = false;

  function processValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const result = sanitizePII(value, options);
      if (result.piiDetected) {
        piiFound = true;
        result.piiTypes.forEach(t => allTypes.add(t));
      }
      return result.sanitized;
    }
    
    if (Array.isArray(value)) {
      return value.map(processValue);
    }
    
    if (value && typeof value === 'object') {
      const processed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        // Sanitizar também a chave se parecer sensível
        const keyResult = sanitizePII(key, options);
        processed[keyResult.sanitized] = processValue(val);
      }
      return processed;
    }
    
    return value;
  }

  return {
    sanitized: processValue(obj),
    piiDetected: piiFound,
    piiTypes: Array.from(allTypes),
  };
}

/**
 * Cria um resumo de logs sanitizados para o LLM
 * Limita tamanho e remove informações excessivas
 */
export function createLogSummaryForLLM(
  logs: string[],
  options: {
    maxLines?: number;
    maxCharsPerLine?: number;
    maxTotalChars?: number;
    includeLineNumbers?: boolean;
  } = {}
): string {
  const {
    maxLines = 50,
    maxCharsPerLine = 500,
    maxTotalChars = 10000,
    includeLineNumbers = true,
  } = options;

  // Sanitizar primeiro
  const { lines: sanitizedLines, totalPIIDetected, piiTypes } = sanitizeLogLines(logs);

  // Limitar número de linhas
  const limitedLines = sanitizedLines.slice(0, maxLines);

  // Truncar linhas longas
  const truncatedLines = limitedLines.map((line, i) => {
    const truncated = line.length > maxCharsPerLine 
      ? line.slice(0, maxCharsPerLine) + '...[TRUNCATED]'
      : line;
    
    return includeLineNumbers ? `[${i + 1}] ${truncated}` : truncated;
  });

  // Juntar e limitar total
  let result = truncatedLines.join('\n');
  if (result.length > maxTotalChars) {
    result = result.slice(0, maxTotalChars) + '\n...[OUTPUT TRUNCATED]';
  }

  // Adicionar header com metadata
  const header = [
    `--- LOG SUMMARY (${sanitizedLines.length} lines, ${totalPIIDetected} PII items sanitized) ---`,
    piiTypes.length > 0 ? `PII Types Found: ${piiTypes.join(', ')}` : '',
    logs.length > maxLines ? `Showing first ${maxLines} of ${logs.length} lines` : '',
    '---',
  ].filter(Boolean).join('\n');

  return `${header}\n${result}`;
}

export default {
  sanitizePII,
  detectPII,
  sanitizeLogLines,
  sanitizeJSON,
  createLogSummaryForLLM,
};
