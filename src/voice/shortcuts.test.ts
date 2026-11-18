// Pruebas de los atajos de voz. Se corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchShortcut } from './shortcuts';
import { extractWakeCommand } from './wakeword';

test('"llegó Yoryi" y como lo escriba Whisper', () => {
    for (const said of ['llegó Yoryi', 'Llegó Gorgi.', 'llego yorgi', 'ya llegó Jorgi', 'llegó el George', 'Llegó Yoryi!']) {
        const s = matchShortcut(said);
        assert.ok(s, said);
        assert.equal(s!.play, 'pon Daga Adicta de Luigi 21 Plus');
        assert.equal(s!.mentionName, 'Coco');
        assert.match(s!.say, /cabra de las cabras de la economía/);
    }
});

test('de punta a punta desde lo que transcribe Whisper', () => {
    assert.ok(matchShortcut(extractWakeCommand('Ey Alfonso, llegó Yoryi.')!));
    assert.ok(matchShortcut(extractWakeCommand('llegó Gorgi, Alfonso')!));
});

test('"llegó Wiwi" y como lo escriba Whisper', () => {
    for (const said of ['llegó Wiwi', 'Llegó oui oui.', 'llegó Oui, oui!', 'ya llegó wi wi', 'llegó Güigüi', 'llegó el Wiwi', 'llegó ui ui']) {
        const s = matchShortcut(said);
        assert.ok(s, said);
        assert.equal(s!.play, 'pon Manifiéstate de Dani y Magneto');
        assert.match(s!.say, /GOAT de la ingeniería mecánica, top 2 en Saber Pro Colombia y casi médico/);
        assert.equal(s!.mentionName, undefined);
    }
    assert.ok(matchShortcut(extractWakeCommand('Ey Alfonso, llegó Oui Oui.')!));
});

test('otras frases no disparan el atajo', () => {
    assert.equal(matchShortcut('pon Daga Adicta'), null);
    assert.equal(matchShortcut('llegó la comida'), null);
    assert.equal(matchShortcut('Yoryi llegó tarde ayer'), null);
    assert.equal(matchShortcut('salta'), null);
});
