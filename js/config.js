/* 게임 설정 — 단계·찬스·자산 경로. 숫자를 바꾸면 난이도를 쉽게 조절할 수 있다. */
(function () {
  'use strict';
  const SNP = (window.SNP = window.SNP || {});

  SNP.config = {
    version: '1.0.1',
    // 저장 형식이 바뀌면 올린다(옛 진행 저장을 버리고 새로 시작).
    saveFormat: 1,
    title: '별이 빛나는 밤 by Junyeong',

    // 그린 사람 이름 — 제목 「별이 빛나는 밤 by 이름」·작품 설명·완성 카드에 쓰인다(보호자 요청으로 배포본에 넣음).
    // 각 기기의 「설정」이나 주소 ?artist=이름 으로 바꿀 수 있고, 비우면 「어린이 화가」.
    artist: 'Junyeong',

    assets: {
      painting: 'assets/painting.webp',
      thumb: 'assets/painting-thumb.webp',
    },

    // 단계: cols×rows 격자로 자른 뒤 팔레트 밖 칸은 버리고, 너무 작은 조각은 이웃과 합친다.
    // snap = 제자리 인정 거리(칸 크기 대비), chances = 찬스 수
    levels: [
      { id: 'l1', name: '반짝반짝', tag: '처음', cols: 4, rows: 3, chances: 2, snap: 0.32 },
      { id: 'l2', name: '작은 별', tag: '쉬움', cols: 6, rows: 4, chances: 3, snap: 0.28 },
      { id: 'l3', name: '초승달', tag: '보통', cols: 8, rows: 5, chances: 4, snap: 0.25 },
      { id: 'l4', name: '소용돌이', tag: '어려움', cols: 11, rows: 7, chances: 5, snap: 0.22 },
      { id: 'l5', name: '은하수', tag: '아주 어려움', cols: 14, rows: 9, chances: 7, snap: 0.2 },
      { id: 'l6', name: '고흐의 밤', tag: '도전!', cols: 18, rows: 12, chances: 9, snap: 0.2 },
    ],

    // 빠르게 연속으로 맞추면(이전 조각 뒤 comboWindow 밀리초 안) 콤보.
    // comboRefill 개 연속마다 찬스 1개 충전(처음 받은 개수까지만).
    comboWindow: 12000,
    comboRefill: 5,
  };
})();
