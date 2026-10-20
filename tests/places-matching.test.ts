import { describe, it, expect } from 'vitest';
import {
  normalizePlaceName,
  isCompanyName,
  matchNoticeAreas,
  PlaceRecord,
} from '@/lib/official-comparison';

describe('Place Matching & Normalization Rules', () => {
  describe('normalizePlaceName', () => {
    it('lowercases strings', () => {
      expect(normalizePlaceName('NAKASERO')).toBe('nakasero');
      expect(normalizePlaceName('EnTeBBe')).toBe('entebbe');
    });

    it('strips "parts of" prefix', () => {
      expect(normalizePlaceName('Parts of Nakasero')).toBe('nakasero');
      expect(normalizePlaceName('Part of Kololo')).toBe('kololo');
      expect(normalizePlaceName('parts of Ntinda')).toBe('ntinda');
    });

    it('strips punctuation', () => {
      expect(normalizePlaceName('Mukono, T.C.')).toBe('mukono');
      expect(normalizePlaceName('Luwero-Kiwoko Rd.')).toBe('luwero kiwoko');
      expect(normalizePlaceName('Entebbe; Town!')).toBe('entebbe');
      expect(normalizePlaceName('Kireka (Kamuli)')).toBe('kireka kamuli');
    });

    it('strips trailing descriptor words (tc, town council, town, trading centre, rd, road, ltd)', () => {
      expect(normalizePlaceName('Mukono TC')).toBe('mukono');
      expect(normalizePlaceName('Kireka Town Council')).toBe('kireka');
      expect(normalizePlaceName('Jinja Town')).toBe('jinja');
      expect(normalizePlaceName('Bweyogerere Trading Centre')).toBe('bweyogerere');
      expect(normalizePlaceName('Bweyogerere Trading Center')).toBe('bweyogerere');
      expect(normalizePlaceName('Gayaza Rd')).toBe('gayaza');
      expect(normalizePlaceName('Entebbe Road')).toBe('entebbe');
      expect(normalizePlaceName('Kakira Sugar Ltd')).toBe('kakira sugar');
    });

    it('handles multiple trailing words recursively or cleanly', () => {
      expect(normalizePlaceName('Mukono Town T.C.')).toBe('mukono');
    });
  });

  describe('isCompanyName', () => {
    it('detects corporate/institutional entities that must stay unplaced', () => {
      expect(isCompanyName('Tororo Cement Ltd')).toBe(true);
      expect(isCompanyName('Kakira Sugar Limited')).toBe(true);
      expect(isCompanyName('Mukwano Industries')).toBe(true);
      expect(isCompanyName('Steel Rolling Mills Corporation')).toBe(true);
      expect(isCompanyName('Nytil Textile Factory')).toBe(true);
      expect(isCompanyName('Makerere University')).toBe(true);
      expect(isCompanyName('Mulago Hospital')).toBe(true);
      expect(isCompanyName('St Marys Secondary School')).toBe(true);
    });

    it('allows genuine geographic places that do not contain company words', () => {
      expect(isCompanyName('Nakasero')).toBe(false);
      expect(isCompanyName('Luwero Kiwoko')).toBe(false);
      expect(isCompanyName('Entebbe')).toBe(false);
      expect(isCompanyName('Mbarara')).toBe(false);
    });
  });

  describe('Tier 1 matching', () => {
    const mockPlaces: PlaceRecord[] = [
      { name: 'Nakasero', normalized_name: 'nakasero', district: 'Kampala', lat: 0.324, lng: 32.581 },
      { name: 'Kololo', normalized_name: 'kololo', district: 'Kampala', lat: 0.334, lng: 32.595 },
    ];
    const lookup = new Map<string, PlaceRecord[]>();
    for (const p of mockPlaces) lookup.set(p.normalized_name, [p]);

    it('matches exact normalized names', () => {
      const res = matchNoticeAreas(['Parts of Nakasero', 'Kololo TC'], lookup);
      expect(res.length).toBe(2);
      expect(res[0].place_name).toBe('Nakasero');
      expect(res[0].match_quality).toBe('exact');
      expect(res[0].tier).toBe(1);
      expect(res[1].place_name).toBe('Kololo');
      expect(res[1].match_quality).toBe('exact');
      expect(res[1].tier).toBe(1);
    });

    it('leaves companies unplaced even if normalized prefix matches', () => {
      const res = matchNoticeAreas(['Nakasero Soap Factory Ltd'], lookup);
      expect(res.length).toBe(0);
    });
  });

  describe('Tier 2 matching', () => {
    const mockPlaces: PlaceRecord[] = [
      { name: 'Mukono', normalized_name: 'mukono', district: 'Mukono', lat: 0.354, lng: 32.752 },
      { name: 'Gulu', normalized_name: 'gulu', district: 'Gulu', lat: 2.774, lng: 32.299 },
    ];
    const lookup = new Map<string, PlaceRecord[]>();
    for (const p of mockPlaces) lookup.set(p.normalized_name, [p]);

    it('matches first word if >= 5 letters when tier 1 fails, marking match_quality=partial', () => {
      // "Mukono Industrial Zone" -> first word is "mukono" (6 letters)
      const res = matchNoticeAreas(['Mukono Industrial Zone'], lookup);
      expect(res.length).toBe(1);
      expect(res[0].place_name).toBe('Mukono');
      expect(res[0].match_quality).toBe('partial');
      expect(res[0].tier).toBe(2);
    });

    it('does NOT match first word if < 5 letters', () => {
      // "Gulu Substation Area" -> first word is "gulu" (4 letters)
      const res = matchNoticeAreas(['Gulu Substation Area'], lookup);
      expect(res.length).toBe(0);
    });
  });

  describe('Notice Anchor and 40 km Rule', () => {
    // Kampala anchor places
    const nakasero: PlaceRecord = {
      name: 'Nakasero',
      normalized_name: 'nakasero',
      district: 'Kampala',
      lat: 0.324,
      lng: 32.581,
    };
    const kololo: PlaceRecord = {
      name: 'Kololo',
      normalized_name: 'kololo',
      district: 'Kampala',
      lat: 0.334,
      lng: 32.595,
    };

    // Ambiguous place "Kasubi": one in Kampala (~3 km from anchor), one in Gulu (~270 km from anchor)
    const kasubiKampala: PlaceRecord = {
      name: 'Kasubi',
      normalized_name: 'kasubi',
      district: 'Kampala',
      lat: 0.333,
      lng: 32.553,
    };
    const kasubiGulu: PlaceRecord = {
      name: 'Kasubi',
      normalized_name: 'kasubi',
      district: 'Gulu',
      lat: 2.775,
      lng: 32.295,
    };

    // Place far away (> 40 km from Kampala), e.g. Jinja (~70 km away)
    const jinjaFar: PlaceRecord = {
      name: 'Jinja Village',
      normalized_name: 'jinja village',
      district: 'Jinja',
      lat: 0.443,
      lng: 33.203,
    };

    const lookup = new Map<string, PlaceRecord[]>();
    lookup.set('nakasero', [nakasero]);
    lookup.set('kololo', [kololo]);
    lookup.set('kasubi', [kasubiKampala, kasubiGulu]);
    lookup.set('jinja village', [jinjaFar]);

    it('picks candidate nearest to notice anchor if within 40 km', () => {
      // Notice has Nakasero & Kololo (unambiguous tier 1) -> forms Kampala anchor
      // Kasubi has 2 candidates -> should resolve to Kampala (3 km away), rejecting Gulu (270 km away)
      const res = matchNoticeAreas(['Nakasero', 'Kololo', 'Kasubi'], lookup);
      expect(res.length).toBe(3);

      const kasubiMatch = res.find((m) => m.place_name === 'Kasubi');
      expect(kasubiMatch).toBeDefined();
      expect(kasubiMatch?.district).toBe('Kampala');
      expect(kasubiMatch?.distance_to_anchor_km).toBeLessThan(10);
    });

    it('rejects candidates that are farther than 40 km from the notice anchor', () => {
      // Notice has Nakasero & Kololo (Kampala anchor) + Jinja Village (70 km away)
      const res = matchNoticeAreas(['Nakasero', 'Kololo', 'Jinja Village'], lookup);
      expect(res.length).toBe(2);
      expect(res.find((m) => m.place_name === 'Nakasero')).toBeDefined();
      expect(res.find((m) => m.place_name === 'Kololo')).toBeDefined();
      expect(res.find((m) => m.place_name === 'Jinja Village')).toBeUndefined();
    });

    it('leaves ambiguous places unplaced if notice has NO anchor', () => {
      // Notice has only Kasubi (which has 2 candidates across Uganda) and no unambiguous tier-1 match
      const res = matchNoticeAreas(['Kasubi'], lookup);
      // Must not pick arbitrarily!
      expect(res.length).toBe(0);
    });
  });
});
