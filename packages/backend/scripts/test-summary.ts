import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

const samplePayload = {
  userId: 'alen',
  date: '2025-12-06',
  repos: [
    {
      name: 'project-x',
      commits: [
        {
          hash: 'abc1234',
          message: 'feat: add login validation',
          timestamp: '2025-12-06T10:15:00Z',
        },
        {
          hash: 'def5678',
          message: 'fix: resolve redirect issue',
          timestamp: '2025-12-06T11:20:00Z',
        },
      ],
    },
    {
      name: 'project-y',
      commits: [
        {
          hash: 'ghi9012',
          message: 'chore: update dependencies',
          timestamp: '2025-12-06T12:00:00Z',
        },
      ],
    },
  ],
};

async function runTest() {
  try {
    console.log('Posting commits (bulk)...');
    const postRes = await axios.post(`${API_URL}/commits`, samplePayload);
    console.log('Post response:', JSON.stringify(postRes.data, null, 2));

    console.log('Fetching daily summary...');
    const getRes = await axios.get(`${API_URL}/daily-summary`, {
      params: { userId: 'alen', date: '2025-12-06' },
    });

    console.log('Daily Summary Response:');
    console.log(JSON.stringify(getRes.data, null, 2));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error:', error.response ? error.response.data : error.message);
    } else {
      console.error('Error:', error);
    }
  }
}

runTest();
