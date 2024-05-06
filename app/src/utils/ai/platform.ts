
import aiplatform, { helpers } from '@google-cloud/aiplatform';
import { google } from '@google-cloud/aiplatform/build/protos/protos';

// Imports the Google Cloud Prediction service client
const { PredictionServiceClient } = aiplatform.v1;

/**
* TODO(developer): Uncomment these variables before running the sample.\
* (Not necessary if passing values as arguments)
*/
const project = 'YOUR_PROJECT_ID';
const location = 'YOUR_PROJECT_LOCATION';

// Specifies the location of the api endpoint
const clientOptions = {
  apiEndpoint: 'us-central1-aiplatform.googleapis.com',
};
const publisher = 'google';
const model = 'chat-bison@001';

// Instantiates a client
const predictionServiceClient = new PredictionServiceClient(clientOptions);

async function callPredict() {
  // Configure the parent resource
  const endpoint = `projects/${project}/locations/${location}/publishers/${publisher}/models/${model}`;

  const prompt = {
    context:
      'My name is Miles. You are an astronomer, knowledgeable about the solar system.',
    examples: [
      {
        input: { content: 'How many moons does Mars have?' },
        output: {
          content: 'The planet Mars has two moons, Phobos and Deimos.',
        },
      },
    ],
    messages: [
      {
        author: 'user',
        content: 'How many planets are there in the solar system?',
      },
    ],
  };
  const instanceValue = helpers.toValue(prompt);
  const instances = [instanceValue] as google.protobuf.IValue[];

  const parameter = {
    temperature: 0.2,
    maxOutputTokens: 256,
    topP: 0.95,
    topK: 40,
  };
  const parameters = helpers.toValue(parameter);

  const request = {
    endpoint,
    instances,
    parameters,
  };

  // Predict request
  const [response] = await predictionServiceClient.predict(request);
  console.log('Get chat prompt response');
  const predictions = response.predictions;
  console.log('\tPredictions :');
  for (const prediction of predictions as google.protobuf.IValue[]) {
    console.log(`\t\tPrediction : ${JSON.stringify(prediction)}`);
  }
}

callPredict();