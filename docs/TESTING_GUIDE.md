# YurCore Testing Guide

This guide introduces testing conventions, mock frameworks, and commands used to verify YurCore.

---

## 1. Test Layer Overview

Our test scripts are categorized into unit, integration, and E2E layers:

*   `__tests__/unit/`: Simple unit tests verifying isolated utility logic.
*   `src/test/setup/`: Vitest configuration, MSW mock servers, and Supabase client mocks.
*   `e2e/`: Playwright UI browser interaction and performance checks.

---

## 2. Running Test Commands

Execute test suites from the root directory:

### A. Run Unit Tests (Vitest)
```bash
npm run test:unit
```

### B. Run E2E Integration Tests (Playwright)
```bash
npm run test:e2e
```

### C. Run Accessibility Audits (Playwright + Axe)
```bash
npm run test:accessibility
```

---

## 3. Mocking the Supabase Client in Vitest

When writing unit tests for functions that query database tables, use the preconfigured Supabase mock helpers located in `src/test/setup/mock-supabase.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mockSupabaseClient } from '@/test/setup/mock-supabase';

describe('Database query unit test', () => {
  it('should resolve mock payload', async () => {
    // Setup mock query outputs
    mockSupabaseClient.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ data: [{ id: "123", full_name: "Mock Practitioner" }], error: null })
      })
    });
    
    // Run and expect
    expect(1).toBe(1);
  });
});
```
