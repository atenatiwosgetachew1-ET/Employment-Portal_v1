import { describe, it, expect } from 'vitest'
import {
  normalizeSearchValue,
  matchesSearchQuery,
  matchesExactFilter,
  matchesBooleanFilter
} from '../utils/filtering'

describe('filtering utilities', () => {
  describe('normalizeSearchValue', () => {
    it('lowercases and trims values', () => {
      expect(normalizeSearchValue('  Hello WORLD  ')).toBe('hello world')
      expect(normalizeSearchValue(null)).toBe('')
      expect(normalizeSearchValue(undefined)).toBe('')
      expect(normalizeSearchValue(1234)).toBe('1234')
    })
  })

  describe('matchesSearchQuery', () => {
    it('returns true if query is empty or whitespace', () => {
      expect(matchesSearchQuery(['John', 'Doe'], '')).toBe(true)
      expect(matchesSearchQuery(['John', 'Doe'], '   ')).toBe(true)
    })

    it('matches when any candidate value includes the query', () => {
      expect(matchesSearchQuery(['Superuser', 'Admin'], 'admin')).toBe(true)
      expect(matchesSearchQuery(['Agent 1', 'agent@example.com'], 'EXAMPLE')).toBe(true)
      expect(matchesSearchQuery(['No match here'], 'xyz')).toBe(false)
    })
  })

  describe('matchesExactFilter', () => {
    it('matches exact string representation', () => {
      expect(matchesExactFilter('admin', 'admin')).toBe(true)
      expect(matchesExactFilter('staff', 'admin')).toBe(false)
      expect(matchesExactFilter('any', '')).toBe(true) // empty filter matches all
    })
  })

  describe('matchesBooleanFilter', () => {
    it('matches boolean filters accurately', () => {
      expect(matchesBooleanFilter(true, 'true')).toBe(true)
      expect(matchesBooleanFilter(false, 'false')).toBe(true)
      expect(matchesBooleanFilter(true, 'false')).toBe(false)
      expect(matchesBooleanFilter(false, 'true')).toBe(false)
      expect(matchesBooleanFilter(true, '')).toBe(true) // empty filter matches all
    })
  })
})