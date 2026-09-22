export const videoId = "XFl4q2FfkVg";
const recommendation = {
  lockupViewModel: {
    contentId: "abcdefghijk",
    metadata: {
      lockupMetadataViewModel: {
        title: { content: "Related skate lesson" },
        metadata: {
          contentMetadataViewModel: {
            metadataRows: [
              { metadataParts: [{ text: { content: "Another channel" } }] },
            ],
          },
        },
      },
    },
    contentImage: {
      thumbnailViewModel: {
        image: {
          sources: [{ url: "https://fixture.example/related.svg", width: 336 }],
        },
      },
    },
  },
};
export const initial = {
  contents: {
    twoColumnWatchNextResults: {
      results: {
        results: {
          contents: [
            {
              videoPrimaryInfoRenderer: {
                title: { simpleText: "Fixture skate video" },
                viewCount: {
                  videoViewCountRenderer: {
                    viewCount: { simpleText: "123 views" },
                  },
                },
                dateText: { simpleText: "Jan 1, 2026" },
              },
            },
            {
              videoSecondaryInfoRenderer: {
                owner: {
                  videoOwnerRenderer: {
                    title: { simpleText: "Fixture channel" },
                    thumbnail: {
                      thumbnails: [
                        {
                          url: "https://fixture.example/avatar.svg",
                          width: 88,
                        },
                      ],
                    },
                    subscriberCountText: { simpleText: "10 subscribers" },
                  },
                },
                attributedDescription: {
                  content: "A real description from the fixture source.",
                },
              },
            },
            {
              itemSectionRenderer: {
                sectionIdentifier: "comment-item-section",
                contents: [
                  {
                    continuationItemRenderer: {
                      continuationEndpoint: {
                        commandMetadata: {
                          webCommandMetadata: {
                            apiUrl: "http://127.0.0.1/not-allowed",
                          },
                        },
                        continuationCommand: {
                          token: "fixture-read-only-continuation",
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      secondaryResults: {
        secondaryResults: {
          results: [
            recommendation,
            {
              compactVideoRenderer: {
                videoId: "lmnopqrstuv",
                title: { simpleText: "Second related video" },
                thumbnail: {
                  thumbnails: [
                    { url: "https://fixture.example/second.svg", width: 336 },
                  ],
                },
                shortBylineText: { simpleText: "Second channel" },
              },
            },
          ],
        },
      },
    },
  },
};
export const player = {
  videoDetails: {
    videoId,
    title: "Fixture skate video",
    author: "Fixture channel",
    thumbnail: {
      thumbnails: [
        { url: "https://fixture.example/small.svg", width: 336 },
        { url: "https://fixture.example/hero.svg", width: 1280 },
      ],
    },
  },
};
export const comments = {
  onResponseReceivedEndpoints: [
    {
      reloadContinuationItemsCommand: {
        continuationItems: [
          {
            commentsHeaderRenderer: { countText: { simpleText: "2 comments" } },
          },
          {
            commentThreadRenderer: {
              commentViewModel: { commentViewModel: { commentKey: "first" } },
            },
          },
          {
            commentThreadRenderer: {
              comment: {
                commentRenderer: {
                  commentId: "second",
                  authorText: { simpleText: "Second viewer" },
                  contentText: { runs: [{ text: "A second real comment." }] },
                },
              },
            },
          },
        ],
      },
    },
  ],
  frameworkUpdates: {
    entityBatchUpdate: {
      mutations: [
        {
          payload: {
            commentEntityPayload: {
              key: "first",
              properties: {
                commentId: "first",
                content: {
                  content: "An actual comment, not a loading placeholder.",
                },
                publishedTime: "1 day ago",
              },
              author: {
                displayName: "First viewer",
                avatarThumbnailUrl: "https://fixture.example/avatar.svg",
              },
              toolbar: { likeCountNotliked: "4" },
            },
          },
        },
        {
          payload: {
            commentEntityPayload: {
              key: "unreferenced-reply",
              properties: {
                commentId: "unreferenced-reply",
                content: {
                  content:
                    "This nested reply must not be shown as a root comment.",
                },
              },
            },
          },
        },
      ],
    },
  },
};
