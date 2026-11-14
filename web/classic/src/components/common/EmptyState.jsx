/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

// Empty-state copy and illustration follow PPanel's empty component
// (GPL-3.0-or-later), adapted here for the classic frontend.
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const EMPTY_STATE_TIPS = [
  "Imagine this space filled with exciting content! For now, you'll have to use your imagination...",
  "This area mysteriously disappeared, but we're summoning it back!",
  'Oh no, nothing happened... Feel free to fill in the blank!',
  "It's like discovering an empty stage at a concert... Why not go up and perform?",
  "You've found a blank canvas! How about building a house?",
  'This area is currently empty, but creativity starts here!',
  "Nothing here... but don't worry, it's just the beginning!",
  'This place was supposed to have a big surprise, but the surprise slipped away!',
  "There's nothing here for now, like an empty snack cabinet.",
  'This empty space is waiting for its protagonist to take the stage!',
];

const EmptyState = ({ description }) => {
  const { t } = useTranslation();
  const messages = useMemo(
    () => EMPTY_STATE_TIPS.map((tip) => t(tip)),
    [t],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * messages.length));
  }, [messages]);

  return (
    <div className='flex flex-col items-center justify-center px-4 py-8 text-center'>
      <svg
        className='text-slate-300 dark:text-slate-600'
        fill='currentColor'
        height='41'
        stroke='currentColor'
        viewBox='0 0 64 41'
        width='64'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
      >
        <g fill='none' fillRule='evenodd' transform='translate(0 1)'>
          <ellipse cx='32' cy='33' fill='currentColor' opacity={0.35} rx='32' ry='7' />
          <g fillRule='nonzero' stroke='currentColor' strokeOpacity={0.45}>
            <path d='M55 12.76L44.854 1.258C44.367.474 43.656 0 42.907 0H21.093c-.749 0-1.46.474-1.947 1.257L9 12.761V22h46v-9.24z' />
            <path
              d='M41.613 15.931c0-1.605.994-2.93 2.227-2.931H55v18.137C55 33.26 53.68 35 52.05 35h-40.1C10.32 35 9 33.259 9 31.137V13h11.16c1.233 0 2.227 1.323 2.227 2.928v.022c0 1.605 1.005 2.901 2.237 2.901h14.752c1.232 0 2.237-1.308 2.237-2.913v-.007z'
              fill='currentColor'
            />
          </g>
        </g>
      </svg>
      <div className='mt-3 text-sm text-slate-500 dark:text-slate-400'>
        {description || messages[index]}
      </div>
    </div>
  );
};

export default EmptyState;
