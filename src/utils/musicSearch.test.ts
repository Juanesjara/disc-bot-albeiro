import { test } from 'node:test';
import assert from 'node:assert/strict';
import { songsFromMusicItems } from './musicSearch';

test('songsFromMusicItems: solo deja canciones con id y título', () => {
    const songs = songsFromMusicItems([
        { item_type: 'song', id: 'a1', title: 'Kyoto', artists: [{ name: 'Omar Courtz' }, { name: 'De La Rose' }], duration: { seconds: 248 } },
        { item_type: 'video', id: 'v1', title: 'Kyoto Travel Guide' },
        { item_type: 'artist', id: 'ar1', title: 'Skrillex' },
        { item_type: 'song', title: 'Sin id' },
        { item_type: 'song', id: 'a2' },
    ]);
    assert.deepEqual(songs, [
        { id: 'a1', title: 'Kyoto', author: 'Omar Courtz, De La Rose', seconds: 248, thumbnail: undefined },
    ]);
});

test('songsFromMusicItems: sin artistas ni duración usa valores por defecto', () => {
    const [song] = songsFromMusicItems([{ item_type: 'song', id: 'x', title: 'Algo' }]);
    assert.equal(song.author, 'Desconocido');
    assert.equal(song.seconds, 0);
});

test('songsFromMusicItems: elige la miniatura más grande', () => {
    const [song] = songsFromMusicItems([{
        item_type: 'song', id: 'x', title: 'Algo',
        thumbnails: [{ url: 'chica', width: 60 }, { url: 'grande', width: 544 }, { url: 'media', width: 226 }],
    }]);
    assert.equal(song.thumbnail, 'grande');
});

test('songsFromMusicItems: lista vacía', () => {
    assert.deepEqual(songsFromMusicItems([]), []);
});
