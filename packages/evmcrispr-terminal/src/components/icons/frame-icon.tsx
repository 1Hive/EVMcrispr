import { createIcon } from '@chakra-ui/icons';

const FrameIcon = createIcon({
  displayName: 'FrameIcon',
  viewBox: '0 0 153.4 152.9',
  path: [
    <defs key={'frame-icon-1'}>
      <linearGradient id="a" gradientTransform="rotate(45)">
        <stop offset="0%" style={{ stopColor: '#2b254f' }} />
        <stop offset="100%" style={{ stopColor: '#192f45' }} />
      </linearGradient>
    </defs>,
    <path
      key={'frame-icon-2'}
      fill="url('#a')"
      d="M145.1 75.6v-58c0-5.1-4.2-9.3-9.3-9.3H77.7c-.6 0-1.1-.2-1.6-.6l-7-7c-.4-.4-1-.7-1.6-.7H9.3C4.2 0 0 4.1 0 9.3v58c0 .6.2 1.1.6 1.6l7 7c.4.4.7 1 .7 1.6v58c0 5.1 4.2 9.3 9.3 9.3h58.2c.6 0 1.1.2 1.6.6l7 7c.4.4 1 .6 1.6.6h58.2c5.1 0 9.3-4.1 9.3-9.3v-58c0-.6-.2-1.1-.6-1.6l-7-7c-.5-.4-.8-.9-.8-1.5zm-39.5 31H47.9c-.7 0-1.3-.6-1.3-1.3V47.7c0-.7.6-1.3 1.3-1.3h57.7c.7 0 1.3.6 1.3 1.3v57.6c.1.7-.5 1.3-1.3 1.3z"
    />,
  ],
});

export default FrameIcon;
